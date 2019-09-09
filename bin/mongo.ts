import * as commander from 'commander'
import { Provider } from '../src/provider'
import { LogLevel } from '../src/logger'
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
    .option('--ds-url <ds-url>', 'Connect to this deepstream server')
    .option('--log-level <level>', 'Log messages with this level and above', parseLogLevel)
    .option('--collection-lookup <fileName>', 'JSON file containing model lookups', loadJSON)
    .option('--inspect <url>', 'Enable node inspector')
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

  try {
    const provider = new Provider({
      database: providerCLI.mongoDatabase || process.env.MONGO_DATABASE || 'deepstream',
      deepstreamUrl: providerCLI.deepstreamUrl || process.env.DEEPSTREAM_URL || 'ws://localhost:6020/deepstream',
      deepstreamCredentials: { backendSecret: process.env.DEEPSTREAM_PASSWORD || 'deepstream_password' },
      connectionConfig: {
        connectionUrl: process.env.MONGO_URL || 'mongodb://localhost:27017'
      },
      logLevel: LogLevel.DEBUG,
      collectionLookup: providerCLI.collectionLookup
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
      console.error(`Error parsing collection lookup file from path ${path.resolve('.', filePath)}`)
      process.exit(1)
    }
  } catch (e) {
    console.error(`Error loading collection lookup file from path ${path.resolve('.', filePath)}`)
    process.exit(1)
  }
}
