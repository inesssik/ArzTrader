import { createClient, type RedisClientType } from 'redis';
import { singleton } from 'tsyringe';
import { ConfigService } from '../config/ConfigService';
import { LoggerService } from '../utils/Logger';

@singleton()
export class RedisService {
  private readonly client: RedisClientType;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService
  ) {
    this.client = createClient({ url: config.values.REDIS_URL });
  }

  public async init() {
    this.client.on('error', err => this.logger.error('[RedisService] Помилка:', err));
    this.client.on('connect', () => this.logger.info('[RedisService] Підключено до Redis'));
    await this.client.connect();
  }

  public async setIfNotExists(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, '1', {
      condition: 'NX',
      expiration: { type: 'EX', value: ttlSeconds }
    });

    return result === 'OK';
  }
}
