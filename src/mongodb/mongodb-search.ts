import { Query, RealtimeSearch, RealtimeSearchCallbacks, QueryOperators } from '../provider'
import { MongoClient, Collection, ChangeStream, ObjectID, FilterQuery } from 'mongodb'
import { splitEvery } from 'ramda'
import { StdLogger } from '../logger/std-logger'
import { PinoLogger } from '../logger/pino-logger'

export class MongoDBSearch implements RealtimeSearch {
  private collection: Collection
  private changeStream: ChangeStream
  private mongoQuery: FilterQuery<any>
  private isReady: boolean = false

  constructor (
    logger: StdLogger | PinoLogger,
    private database: string,
    private query: Query,
    private callbacks: RealtimeSearchCallbacks,
    private mongoClient: MongoClient,
    ) {
    this.mongoQuery = convertToMongoQuery({}, this.query.query)
    const db = this.mongoClient.db(this.database)
    this.collection = db.collection(this.query.table)
    this.changeStream = this.collection.watch([], {})
    this.changeStream.on('change', this.runQuery.bind(this))
  }

  /**
   * Returns once the initial search is completed
   */
  public async whenReady (): Promise<void> {
    if (!this.isReady) {
      await this.runQuery()
      this.isReady = true
    }
  }

  /**
   * Closes the realtime-cursor. It also deletes the list if called
   * as a result of an unsubscribe call to the record listener, but not if called
   * as a result of the list being deleted.
   */
  public async stop (): Promise<void> {
    this.changeStream.close()
  }

  private async runQuery () {
    const result = await this.collection.find(this.mongoQuery, { projection: { _id: 1 } }).toArray()
    const entries = result.map((r) => `${r._id}`)
    this.callbacks.onResultsChanged(entries)
  }
}

const convertToMongoQuery = (result: any, condition: any[]): any => {
  if (typeof condition[0] === 'string') {
    if (condition.length === 3) {
      return mongonize(result, condition)
    }
    if (condition.length > 3) {
      result.$or = splitEvery(3, condition).map((c) => convertToMongoQuery({}, c))
      return result
    }
  }

  condition.reduce((r, c) => {
    return convertToMongoQuery(r, c)
  }, result)
  return result
}

const mongonize = (result: any = {}, condition: any) => {
  const [field, operator] = condition
  let value = condition[2]

  if (ObjectID.isValid(value)) {
    value = new ObjectID(value)
  }
  switch (operator) {
    case QueryOperators.EQUAL: {
      result[field] = {$eq: value}
      break
    }
    case QueryOperators.NOT_EQUAL: {
      result[field] = {$ne: value}
      break
    }
    case QueryOperators.IN: {
      result[field] = {$in: value}
      break
    }
    case QueryOperators.CONTAINS: {
      result[field] = {name: `/${value}/`}
      break
    }
    case QueryOperators.MATCH: {
      const $options = value.startsWith('(?i)') ? '$i' : undefined
      result[field] = {$regex: new RegExp(value.replace('(?i)', '')), $options }
      break
    }
    case QueryOperators.GREATER_THAN: {
      result[field] = {$gt: value}
      break
    }
    case QueryOperators.GREATER_EQUAL_THEN: {
      result[field] = {$gte: value}
      break
    }
    case QueryOperators.LESS_THAN: {
      result[field] = {$lt: value}
      break
    }
    case QueryOperators.LESS_THAN_EQUAL: {
      result[field] = {$lte: value}
      break
    }
  }
  return result
}
