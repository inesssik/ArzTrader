import 'dotenv/config.js';
import 'reflect-metadata';
import { container } from 'tsyringe';
import { ArzApiService } from './ArzApiService';
import { BotService } from './BotService';
import { ConfigService } from './ConfigService';
import { LoggerService } from './LoggerService';
import { PrismaService } from './PrismaService';

async function bootstrap() {
  container.resolve(ConfigService);
  const logger = container.resolve(LoggerService);

  container.resolve(PrismaService);
  const arz = container.resolve(ArzApiService);
  console.log(await arz.getOnlines())

  const botService = container.resolve(BotService);
  await botService.init();

  logger.info('All services has been started...');
}

bootstrap();
