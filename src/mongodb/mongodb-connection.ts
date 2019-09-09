import { DatabaseClient, RealtimeSearchConfig, RealtimeSearchCallbacks } from '../provider'
import { Logger } from '../logger'
import { MongoClient } from 'mongodb'
import { MongoDBSearch } from './mongodb-search'
import { Query } from '../provider'
import { RealtimeSearch } from '../provider'

interface MongoDBConfig extends RealtimeSearchConfig {
    connectionConfig: {
        connectionUrl: string
    }
}

export class MongoDBConnection implements DatabaseClient {
    private mongoClient!: MongoClient

    constructor (private config: MongoDBConfig, private logger: Logger) {
    }

    public async start (): Promise<void> {
        this.logger.info('Initialising MongoDB Connection')
        try {
          this.mongoClient = await MongoClient.connect(this.config.connectionConfig.connectionUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true
          })
          this.mongoClient.db(this.config.database)
          this.logger.info(`Connected successfully to mongodb database ${this.config.database}`)
        } catch (e) {
          this.logger.fatal('Error connecting to mongodb', e)
        }
    }

    public getSearch (logger: Logger, database: string, query: Query, callbacks: RealtimeSearchCallbacks): RealtimeSearch {
      return new MongoDBSearch(logger, database, query, callbacks, this.mongoClient)
    }
    public async stop (): Promise<void> {
        await this.mongoClient.close()
    }
}
