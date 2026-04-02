import 'dotenv/config.js';
import 'reflect-metadata';
import { container } from 'tsyringe';
import { ArzApiService } from './ArzApiService';
import { BotService } from './BotService';
import { ConfigService } from './ConfigService';
import { LoggerService } from './LoggerService';
import { PrismaService } from './PrismaService';
import { MarketSyncService } from './MarketSyncService';
import { StatisticsService } from './StatisticsService';
import { LavkaService } from './LavkaService';

async function bootstrap() {
  container.resolve(ConfigService);
  container.resolve(LoggerService);
  container.resolve(PrismaService);
  container.resolve(ArzApiService);
  container.resolve(LavkaService);

  const syncService = container.resolve(MarketSyncService);
  syncService.init();

  const statsService = container.resolve(StatisticsService);
  statsService.init();

  const botService = container.resolve(BotService);
  await botService.init();
}

bootstrap();
