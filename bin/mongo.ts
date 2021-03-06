import * as commander from 'commander'
import { Provider, LogLevel } from '../src/provider'
import * as fs from 'fs'
import * as path from 'path'

// work-around for:
// TS4023: Exported variable 'command' has or is using name 'local.Command'
// from external module "node_modules/commander/typings/index" but cannot be named.
// tslint:disable-next-line: no-empty-interface
export interface Command extends commander.Command { }

export const mongo = (program: Command) => {
  program
    .command('mongo')
    .description('start a mongodb realtime search provider')
    .option('--mongo-url <mongo-url>', 'Connect to this mongo server')
    .option('--mongo-database <mongo-database>', 'Name of mongo database')
    .option('--primary-key <primary-key>', 'Primary key used on deepstream objects')
    .option('--ds-url <ds-url>', 'Connect to this deepstream server')
    .option('--ds-credentials <ds-credentials>', 'Deepstream credentials login')
    .option('--logger-type <logger-type>', 'Log messages with pino or to std')
    .option('--log-level <level>', 'Log messages with this level and above', parseLogLevel)
    .option('--collection-lookup <fileName>', 'JSON file containing model lookups', loadJSON)
    .option('--exclude-table-prefix', "Don't add the table prefix to results, this means you can't directly use named to load records")
    .option('--inspect <url>', 'Enable node inspector')
    .option('--native-query', 'Use native mongodb query syntax')
    .action(action)
}

function action () {
  // @ts-ignore
  const providerCLI = this

  const inspectUrl = providerCLI.inspect
  if (inspectUrl) {
    const inspector = require('inspector')
    const [host, port] = providerCLI.inspect.split(':')
    if (!host || !port) {
      throw new Error('Invalid inspect url, please provide host:port')
    }
    inspector.open(port, host)
  }

  let deepstreamCredentials = {}
  if (process.env.DEEPSTREAM_PASSWORD) {
    deepstreamCredentials = {
      username: 'realtime_search',
      password: process.env.DEEPSTREAM_PASSWORD || 'deepstream_password'
    }
  } else if (providerCLI.dsCredentials || process.env.DEEPSTREAM_CREDENTIALS) {
    try {
      deepstreamCredentials = JSON.parse(providerCLI.dsCredentials || process.env.DEEPSTREAM_CREDENTIALS)
    } catch (e) {
      console.error('Invalid deepstream credentials provided')
      process.exit(1)
    }
  }

  try {
    const provider = new Provider({
      database: providerCLI.mongoDatabase || process.env.MONGO_DATABASE || 'deepstream',
      deepstreamUrl: providerCLI.deepstreamUrl || process.env.DEEPSTREAM_URL || 'ws://localhost:6020/deepstream',
      deepstreamCredentials,
      connectionConfig: {
        connectionUrl: process.env.MONGO_URL || 'mongodb://localhost:27017',
        poolSize: process.env.MONGO_POOL_SIZE || 100,
      },
      loggerType: providerCLI.loggerType || process.env.DEEPSTREAM_REALTIME_SEARCH_LOGGER_TYPE || 'std',
      logLevel: providerCLI.logLevel || process.env.DEEPSTREAM_REALTIME_SEARCH_LOG_LEVEL || LogLevel.INFO,
      collectionLookup: providerCLI.collectionLookup,
      nativeQuery: providerCLI.nativeQuery || false,
      primaryKey: process.env.MONGO_PRIMARY_KEY || 'ds_key',
      excludeTablePrefix: providerCLI.excludeTablePrefix || false
    })
    provider.start()
    process
      .removeAllListeners('SIGINT').on('SIGINT', async () => {
        await provider.stop()
        process.exit(0)
      })
  } catch (err) {
    console.error(err.toString())
    process.exit(1)
  }
}

/**
* Used by commander to parse the log level and fails if invalid
* value is passed in
*/
function parseLogLevel (logLevel: string) {
  if (!/debug|info|warn|error|off/i.test(logLevel)) {
    console.error('Log level must be one of the following (debug|info|warn|error|off)')
    process.exit(1)
  }
  return logLevel.toUpperCase()
}

/**
* Load JSON
*/
function loadJSON (filePath: string) {
  try {
    const content = fs.readFileSync(path.resolve('.', filePath), 'utf8')
    try {
      return JSON.parse(content)
    } catch (e) {
      console.error(`Error parsing collection lookup file from path ${path.resolve('.', filePath)}`, e)
      process.exit(1)
    }
  } catch (e) {
    console.error(`Error loading collection lookup file from path ${path.resolve('.', filePath)}`, e)
    process.exit(1)
  }
}
