import pino, { type Logger } from 'pino';
import { singleton } from 'tsyringe';

@singleton()
export class LoggerService {
  private readonly pinoLogger: Logger;

  constructor() {
    this.pinoLogger = pino({
      level: 'info',
      transport: {
        target: 'pino-pretty'
      }
    });
  }

  public info(message: string, obj?: object): void {
    obj ? this.pinoLogger.info(obj, message) : this.pinoLogger.info(message);
  }

  public error(message: string, error?: Error | unknown): void {
    error
      ? this.pinoLogger.error(error, message)
      : this.pinoLogger.error(message);
  }

  public warn(message: string, obj?: object): void {
    obj ? this.pinoLogger.warn(obj, message) : this.pinoLogger.warn(message);
  }

  public debug(message: string, obj?: object): void {
    obj ? this.pinoLogger.debug(obj, message) : this.pinoLogger.debug(message);
  }
}
