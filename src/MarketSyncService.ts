import cron from 'node-cron';
import { singleton } from 'tsyringe';
import { ArzApiService } from './ArzApiService';
import { LavkaService } from './LavkaService';
import { LoggerService } from './LoggerService';
import { NotificationService } from './NotificationService';
import { parseGlobalMarket } from './utils/marketMapper';

@singleton()
export class MarketSyncService {
  constructor(
    private readonly apiService: ArzApiService,
    private readonly lavkaService: LavkaService,
    private readonly logger: LoggerService,
    private readonly notificationService: NotificationService
  ) {}

  public init() {
    cron.schedule('*/10 * * * *', async () => {
      await this.syncTask();
    });
    this.syncTask();
  }

  private async syncTask() {
    try {
      this.logger.info('[MarketSync] Починаємо завантаження ринку...');
      const rawData = await this.apiService.getOnlines();

      const parsedData = parseGlobalMarket(rawData);
      this.logger.info(`[MarketSync] Отримано ${parsedData.length} лотів. Оновлюємо БД...`);

      await this.lavkaService.syncFullMarket(parsedData);
      await this.notificationService.processAlerts();
    } catch (error) {
      this.logger.error('[MarketSync] Помилка синхронізації ринку', error);
    }
  }
}
