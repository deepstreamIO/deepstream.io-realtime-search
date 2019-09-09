#!/usr/bin/env node
import * as pgk from '../package.json'

import { Command } from 'commander'
import { mongo } from './mongo'

const program = new Command('provider')
program
  .usage('[command]')
  .version(pgk.version.toString())

mongo(program)

program.parse(process.argv)

if (program.args.length === 0) {
  console.log('Missing command, currently supporting mongo and rethink. Use "realtime-search help" for options')
  process.exit(0)
}
