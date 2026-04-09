import 'dotenv/config.js';
import 'reflect-metadata';
import { container } from 'tsyringe';
import { ArzApiService } from './api/ArzApiService';
import { BotService } from './bot/BotService';
import { ConfigService } from './config/ConfigService';
import { PrismaService } from './database/PrismaService';
import { NotificationService } from './services/NotificationService';
import { StatisticsService } from './services/StatisticsService';
import { MarketAnalyzerService } from './services/market/MarketAnalyzerService';
import { MarketOrchestrator } from './services/market/MarketOrchestrator';
import { MarketSyncService } from './services/market/MarketSyncService';
import { LoggerService } from './utils/Logger';
import { MenuController } from './bot/controllers/MenuController';
import { RedisService } from './database/RedisService';

async function bootstrap() {
  container.resolve(ConfigService);
  container.resolve(LoggerService);
  container.resolve(PrismaService);
  container.resolve(ArzApiService);
  container.resolve(NotificationService);
  container.resolve(MarketSyncService);
  container.resolve(MarketAnalyzerService);
  container.resolve(MenuController);

  const redis = container.resolve(RedisService);
  await redis.init();

  const marketOrchestrator = container.resolve(MarketOrchestrator);
  marketOrchestrator.init();

  const statsService = container.resolve(StatisticsService);
  statsService.init();

  const botService = container.resolve(BotService);
  await botService.init();
}

bootstrap();
