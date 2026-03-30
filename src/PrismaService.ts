import { PrismaPg } from '@prisma/adapter-pg';
import { singleton } from 'tsyringe';
import { PrismaClient } from '../generated/prisma/client';
import { ConfigService } from './ConfigService';

@singleton()
export class PrismaService extends PrismaClient {
  constructor(private readonly configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.values.DATABASE_URL
      })
    });
  }
}