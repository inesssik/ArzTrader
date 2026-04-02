import 'dotenv/config.js';
import 'reflect-metadata';
import { container } from 'tsyringe';
import { ArzApiService } from './ArzApiService';
import { BotService } from './BotService';
import { ConfigService } from './ConfigService';
import { LavkaService } from './LavkaService';
import { LoggerService } from './LoggerService';
import { MarketSyncService } from './MarketSyncService';
import { NotificationService } from './NotificationService';
import { PrismaService } from './PrismaService';
import { StatisticsService } from './StatisticsService';

async function bootstrap() {
  container.resolve(ConfigService);
  container.resolve(LoggerService);
  container.resolve(PrismaService);
  container.resolve(ArzApiService);
  container.resolve(LavkaService);
  container.resolve(NotificationService);

  const syncService = container.resolve(MarketSyncService);
  syncService.init();

  const statsService = container.resolve(StatisticsService);
  statsService.init();

  const botService = container.resolve(BotService);
  await botService.init();
}

bootstrap();
