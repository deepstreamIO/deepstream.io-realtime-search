import { DatabaseClient, RealtimeSearchConfig, RealtimeSearchCallbacks } from '../provider'
import { MongoClient } from 'mongodb'
import { MongoDBSearch } from './mongodb-search'
import { Query } from '../provider'
import { RealtimeSearch } from '../provider'
import { StdLogger } from '../logger/std-logger'
import { PinoLogger } from '../logger/pino-logger'

interface MongoDBConfig extends RealtimeSearchConfig {
    connectionConfig: {
        connectionUrl: string,
        poolSize: number
    }
}

export class MongoDBConnection implements DatabaseClient {
    private mongoClient!: MongoClient

    constructor (private config: MongoDBConfig, private logger: StdLogger | PinoLogger) {
    }

    public async start (): Promise<void> {
        this.logger.info('Initializing MongoDB Connection')
        try {
          this.mongoClient = await MongoClient.connect(this.config.connectionConfig.connectionUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            poolSize: this.config.connectionConfig.poolSize
          })
          this.mongoClient.db(this.config.database)
          this.logger.info(`Connected successfully to mongodb database ${this.config.database}`)
        } catch (e) {
          this.logger.fatal('Error connecting to mongodb', e)
        }
    }

    public getSearch (logger: StdLogger | PinoLogger, database: string, query: Query, callbacks: RealtimeSearchCallbacks): RealtimeSearch {
      return new MongoDBSearch(logger, database, query, callbacks, this.mongoClient, this.config.primaryKey, this.config.nativeQuery)
    }

    public async stop (): Promise<void> {
        await this.mongoClient.close()
    }
}
