import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { singleton } from 'tsyringe';
import { PrismaClient } from '../prisma/generated/prisma/client';
import { ConfigService } from './ConfigService';

@singleton()
export class PrismaService extends PrismaClient {
  constructor(private readonly configService: ConfigService) {
    const pool = new Pool({
      connectionString: configService.values.DATABASE_URL
    });

    super({
      log: ['info', 'warn', 'error'],
      adapter: new PrismaPg(pool)
    });
  }
}
