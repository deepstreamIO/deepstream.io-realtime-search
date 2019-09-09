import * as crypto from 'crypto'
const deepstream = require('@deepstream/client')
import { Client as DeepstreamClient } from '@deepstream/client'
import { JSONObject, RecordData, EVENT } from '@deepstream/client/dist/constants'
import { RPCResponse } from '@deepstream/client/dist/rpc/rpc-response'
import { ListenResponse } from '@deepstream/client/dist/util/listener'

import { Logger, LogLevel } from './logger'
import { MongoDBConnection } from './mongodb/mongodb-connection'

export interface RealtimeSearch {
  stop: () => Promise<void>
}

export interface RealtimeSearchCallbacks {
  onResultsChanged: (entries: string[]) => void,
  onInitialPopulation: () => void
}

export interface DatabaseClient {
  getSearch (logger: Logger, dbName: string, query: Query, callbacks: RealtimeSearchCallbacks): RealtimeSearch
  start: () => Promise<void>
  stop: () => Promise<void>
}

export enum QueryOperators {
  EQUAL = 'eq',
  NOT_EQUAL = 'ne',
  MATCH = 'match',
  GREATER_THAN = 'gt',
  GREATER_EQUAL_THEN = 'ge',
  LESS_THAN = 'lt',
  LESS_THAN_EQUAL = 'le',
  IN = 'in',
  CONTAINS = 'contains'
}

export interface Query {
  table: string,
  query: Array<[string, keyof QueryOperators, any] | [string, QueryOperators.IN, any[]]>,
  order?: any,
  limit?: number,
  meta?: { [index: string]: any }
}

export interface RealtimeSearchConfig {
  listNamePrefix: string,
  metaRecordPrefix: string,
  primaryKey: string,
  logLevel: number,
  database: string,
  deepstreamUrl: string,
  connectionConfig: any,
  deepstreamCredentials: JSONObject,
  heartbeatInterval: number,
  hashSeed: number,
  rpcName: string,
  collectionLookup?: { [index: string]: string }
}

const defaultConfig: RealtimeSearchConfig = {
  rpcName: 'realtime_search',
  listNamePrefix: 'realtime_search/list_',
  metaRecordPrefix: 'realtime_search/meta_',
  primaryKey: 'ds_id',
  logLevel: LogLevel.INFO,
  database: 'deepstream',
  heartbeatInterval: 30000,
  hashSeed: 0xcafebccc,
  deepstreamUrl: 'ws://localhost:6020',
  deepstreamCredentials: {},
  connectionConfig: {}
}

export class Provider {
  private searches = new Map<string, RealtimeSearch>()
  private deepstreamClient!: DeepstreamClient
  private databaseClient!: DatabaseClient
  private config: RealtimeSearchConfig
  private hashReplaceRegex: RegExp
  private logger: Logger

  constructor (config: Partial<RealtimeSearchConfig>) {
    this.config = {  ...defaultConfig, ...config}
    this.logger = new Logger(this.config.logLevel)
    this.hashReplaceRegex = new RegExp(`^${this.config.listNamePrefix}(.*)`)
    this.databaseClient = new MongoDBConnection(this.config, this.logger)
  }

  /**
   * Starts the provider. The provider will emit a
   * 'ready' event once started
   */
  public async start () {
    await this.databaseClient.start()
    await this.initialiseDeepstreamClient()

    this.setupRPC()

    const pattern = `${this.config.listNamePrefix}.*`
    this.logger.info(`listening for ${pattern}`)
    this.deepstreamClient.record.listen(pattern, this.onSubscription.bind(this))

    this.logger.info('realtime search provider ready')
  }

  /**
   * Stops the provider. Closes the deepstream
   * connection and disconnects from mongodb
   */
  public async stop () {
    try {
      this.deepstreamClient.close()
      await this.databaseClient.stop()
    } catch (e) {
      this.logger.fatal('Error shutting down realtime search', e)
    }
  }

  private async initialiseDeepstreamClient () {
    this.logger.info('Initialising Deepstream connection')

    if (!this.config.deepstreamUrl) {
      this.logger.fatal("Can't connect to deepstream, neither deepstreamClient nor deepstreamUrl were provided")
    }

    if (!this.config.deepstreamCredentials) {
      this.logger.fatal('Missing configuration parameter deepstreamCredentials')
    }

    this.deepstreamClient = deepstream(this.config.deepstreamUrl, {
      offlineEnabled: false,
      maxReconnectAttempts: Infinity,
      maxReconnectInterval: 5000
    })

    this.deepstreamClient.on('error', (error: Error, event: EVENT) => {
      this.logger.fatal(`Client error: ${error.message}`, event as any)
    })

    try {
      await this.deepstreamClient.login(this.config.deepstreamCredentials)
      this.logger.info('Successfully logged in to deepstream')
    } catch (ex) {
      this.logger.fatal('Error making deepstream connection and logging in, restarting...')
    }
  }

  private setupRPC () {
    this.deepstreamClient.rpc.provide(this.config.rpcName, async (query: Query | string, response: RPCResponse) => {
      try {
        if (typeof query === 'string') {
          if (query === '__heartbeat__') {
            return response.send('success')
          }
          return response.error('Invalid query parameters, structure should be an object with at least the table')
        }

        if (this.validateQuery(query) === false) {
          return response.error('Invalid query parameters, please refer to provider logs')
        }

        if (this.config.collectionLookup && this.config.collectionLookup[query.table]) {
          query.table = this.config.collectionLookup[query.table]
        }

        const hash = this.hashQueryString(query)
        this.logger.info(`Created hash ${hash} for realtime-search using RPC`)

        try {
          await this.deepstreamClient.record.setDataWithAck(
            `${this.config.metaRecordPrefix}${hash}`,
            {
              query,
              hash,
              populated: false
            } as never as RecordData
          )
          response.send(hash)
        } catch (e) {
          this.logger.error(`Error saving hash in ${this.config.rpcName} rpc method for ${JSON.stringify(query)}: `, e)
          response.error('Error saving search hash. Check the server logs')
          return
        }
      } catch (e) {
        this.logger.error(`Error in ${this.config.rpcName} rpc method for ${JSON.stringify(query)}: `, e)
        response.error(`Error in ${this.config.rpcName} rpc method. Check the server logs`)
      }
    })

    // This heartbeat is for debugging resilience to ensure that the RPC is actually provided.
    // It also means if the connection to deepstream is lost or the provider is offline for any
    // reason it will restart to ensure a clean state.
    setInterval(async () => {
      try {
        await this.deepstreamClient.rpc.make(this.config.rpcName, '__heartbeat__')
        this.logger.debug('heartbeat succeeded')
      } catch (e) {
        this.logger.fatal('heartbeat check failed, restarting rpc provider')
      }
    }, this.config.heartbeatInterval || 3000)

    this.logger.info(`Providing rpc method "${this.config.rpcName}"`)
  }

  /**
   * Callback for the 'listen' method. Gets called everytime a new
   * subscription to the specified pattern is made. Parses the
   * name and - if its the first subscription made to this pattern -
   * creates a new instance of Search
   */
  private async onSubscription (name: string, response: ListenResponse) {
    this.logger.info(`received subscription for ${name}`)
    const result = await this.onSubscriptionAdded(name)
    if (result === true) {
      response.accept()
      response.onStop(() => {
        this.onSubscriptionRemoved(name)
      })
    } else {
      response.reject()
    }
  }

  /**
   * When a search has been started
   */
  private async onSubscriptionAdded (name: string): Promise<boolean> {
    const hash = name.replace(this.hashReplaceRegex, '$1')
    const recordName = `${this.config.metaRecordPrefix}${hash}`

    let query: Query

    try {
      ({ query } = await this.deepstreamClient.record.snapshot(recordName) as never as { query: Query })
    } catch (e) {
      this.logger.error(`Error retrieving snapshot of ${recordName}`, e)
      return false
    }

    if (query === undefined) {
      this.logger.error(`Query is missing for ${recordName}`)
      return false
    }

    this.logger.info(`new search instance being made for search ${hash}`)

    this.searches.set(
      hash,
      this.databaseClient.getSearch(
        this.logger,
        this.config.database,
        query,
        {
          onResultsChanged: this.onResultsChanged.bind(this, `${this.config.listNamePrefix}${hash}`),
          onInitialPopulation: this.onInitialPopulation.bind(this, recordName)
        }
      )
    )

    return true
  }

  /**
   * When a search has been removed
   */
  private async onSubscriptionRemoved (name: string) {
    const hash = name.replace(this.hashReplaceRegex, '$1')

    this.logger.info(`old search instance being removed for search ${hash}`)

    const search = this.searches.get(hash)

    if (search) {
      search.stop()
      this.searches.delete(hash)
    } else {
      this.logger.error(`Error finding search with hash ${hash}`)
    }

    // const record = this.deepstreamClient.record.getRecord(`${this.config.metaRecordPrefix}${hash}`)
    // await record.delete()

    // const list = this.deepstreamClient.record.getRecord(`${this.config.listName}${hash}`)
    // await list.delete()
  }

  private hashQueryString (query: Query) {
    const nameHash = crypto.createHash('md5').update(JSON.stringify(query)).digest('hex')
    const sanitizedName = nameHash.replace(/[^A-Za-z0-9_]/g, '_')
    return sanitizedName
  }

  private validateQuery (query: Query): boolean {
    if (!query.table) {
      this.logger.error(`Missing parameter "table": ${JSON.stringify(query)}`)
      return false
    }

    if (!query.query) {
      this.logger.error(`Missing parameter "query": ${JSON.stringify(query)}`)
      return false
    }

    // if ((query.order && !query.limit) || (query.limit && !query.order)) {
    //   // XOR
    //   this.logger.error(`Must specify both "order" and "limit" together: ${JSON.stringify(query)}`)
    //   return false
    // }

    // for(let i = 0; i < query.query.length; i++) {
    //   const condition = query.query[i]

    //   for (let j = 0; i < condition.length; j++) {
    //     if(condition.length < 3 || condition.length % 3 !== 0) {
    //       this.logger.error('Too few parameters')
    //       return false
    //     }

    //     if(Object.values(QueryOperators).includes(condition[1] as any) === false) {
    //       this.logger.error(`Unknown operator ${condition[1]}`)
    //       return false
    //     }

    //     // could use Array.isArray instead if supported
    //     const valueIsArray = Object.prototype.toString.call(condition[2]) === '[object Array]'
    //     if(condition[1] === 'in' && !valueIsArray) {
    //       this.logger.error(`input in operator requires a JSON array'`)
    //       return false
    //     }
    //   }
    // }

    return true
  }

  private async onResultsChanged (listName: string, entries: string[]) {
    try {
      await this.deepstreamClient.record.setDataWithAck(listName, entries)
      this.logger.debug(`Updated ${listName} with ${entries.length} entries`)
    } catch (e) {
      this.logger.error(`Error setting entries for list ${listName}`, e)
    }
  }

  private async onInitialPopulation (searchMetaRecordName: string) {
    try {
      await this.deepstreamClient.record.setDataWithAck(searchMetaRecordName, 'populated', true as any)
      this.logger.debug(`Set ${searchMetaRecordName} as populated`)
    } catch (e) {
      this.logger.error(`Error setting entries for searchMetaRecordName ${searchMetaRecordName}`, e)
    }
  }
}
