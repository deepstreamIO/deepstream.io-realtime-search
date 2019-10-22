import * as pino from 'pino'
import { LogLevel } from '../provider'

const LogLevelToPino: { [index: number]: string } = {
    [LogLevel.DEBUG]: 'debug',
    [LogLevel.FATAL]: 'fatal',
    [LogLevel.ERROR]: 'error',
    [LogLevel.WARN]: 'warn',
    [LogLevel.INFO]: 'info',
}

export class PinoLogger {
    private logger: pino.Logger = pino()

    constructor (logLevel: LogLevel) {
        this.logger.level = LogLevelToPino[logLevel]
    }

    /**
     * Log as info
     */
    public info (message: string, error?: Error): void {
        this.logger.info({ message, error })
    }

    /**
     * Log as debug
     */
    public debug (message: string, error?: Error): void {
        this.logger.debug({ message, error })
    }

    /**
     * Log as warn
     */
    public warn (message: string, error?: Error): void {
        this.logger.warn({ message, error })
    }

    /**
     * Log as error
     */
    public error (message: string, error?: Error): void {
        this.logger.error({ message, error })
    }

    /**
     * Log as error
     */
    public fatal (message: string, error?: Error): void {
        this.logger.fatal({ message, error })
        process.exit(1)
    }
}
