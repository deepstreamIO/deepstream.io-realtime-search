import { ObjectID, FilterQuery } from 'mongodb'
import { QueryOperators } from '../provider'

function convertToObjectId (value: string) {
    if (ObjectID.isValid(value) && value.toString().length === 24) {
      return new ObjectID(value)
    }
    return value
  }

export function objectIdInArray (query: Array<FilterQuery<any>>): any[] {
  return query.map((val: any) => {
    if (val instanceof Array) {
      return objectIdInArray(val)
    } else if (typeof val === 'object') {
      return objectIDConvertor({}, val)
    } else {
      return convertToObjectId(val)
    }
  })
}

export function objectIDConvertor (currentValue: FilterQuery<any>, query: FilterQuery<any>): FilterQuery<any> {
    return (Object.keys(query) as any).reduce((result: FilterQuery<any>, key: string) => {
      if (query[key] instanceof Array) {
        result[key] = objectIdInArray(query[key])
      } else if (typeof query[key] === 'object') {
        result[key] = objectIDConvertor({}, query[key])
      } else {
        result[key] = convertToObjectId(query[key])
      }
      return result
    }, currentValue)
  }

export const mongonize = (result: any = {}, condition: any) => {
    const [field, operator] = condition
    let value = condition[2]

    if (ObjectID.isValid(value) && value.toString().length === 24) {
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
