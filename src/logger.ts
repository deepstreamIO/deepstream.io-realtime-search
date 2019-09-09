export enum LogLevel {
    DEBUG = 5,
    INFO = 4,
    WARN = 3,
    ERROR = 2,
    FATAL = 1
}

export class Logger {
    constructor (private logLevel: LogLevel) {}

    public debug (message: string) {
        this.log(LogLevel.DEBUG, message)
    }

    public info (message: string) {
        this.log(LogLevel.INFO, message)
    }

    public error (message: string, error?: Error) {
        this.log(LogLevel.FATAL, message, error)
    }

    public fatal (message: string, error?: Error) {
        this.log(LogLevel.FATAL, message, error)
        process.exit(1)
    }

    private log (logLevel: LogLevel, message: string, error?: Error) {
        if (this.logLevel < logLevel) {
            return
        }

        const date = new Date()
        const time = date.toLocaleTimeString()
        if (error) {
            console.log(time + ' | ' + message, error)
        } else {
            console.log(time + ' | ' + message)
        }
    }
}
