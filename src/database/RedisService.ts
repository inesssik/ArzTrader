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
    this.client.on('error', err => this.logger.error('[RedisService] Ошибка:', err));
    this.client.on('connect', () => this.logger.info('[RedisService] Подключено к Redis'));
    await this.client.connect();
  }

  public async setIfNotExists(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, '1', {
      condition: 'NX',
      expiration: { type: 'EX', value: ttlSeconds }
    });

    return result === 'OK';
  }

  public async get<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.set(key, data);
    if (ttlSeconds) {
      await this.client.expire(key, ttlSeconds);
    }
  }

  public async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
