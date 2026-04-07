import cron from 'node-cron';
import { singleton } from 'tsyringe';
import { ArzApiService } from '../../api/ArzApiService';
import { NotificationService } from '../../services/NotificationService';
import { LoggerService } from '../../utils/Logger';
// Додали новий імпорт
import { parseGlobalMarket } from '../../utils/marketMapper';
import { MarketAnalyzerService } from './MarketAnalyzerService';
import { MarketSyncService } from './MarketSyncService';

@singleton()
export class MarketOrchestrator {
  constructor(
    private readonly apiService: ArzApiService,
    private readonly marketSyncService: MarketSyncService,
    private readonly logger: LoggerService,
    private readonly notificationService: NotificationService,
    private readonly marketAnalyzerService: MarketAnalyzerService
  ) {}

  public init() {
    // cron.schedule('*/10 * * * *', async () => {
    //   await this.syncTask();
    // });
    this.syncTask();
  }

  private async syncTask() {
    while (true) {
      try {
        this.logger.info('[MarketSync] Починаємо завантаження ринку...');
        const rawData = await this.apiService.getOnlines();

        const parsedData = parseGlobalMarket(rawData);
        this.logger.info(`[MarketSync] Отримано ${parsedData.length} лотів. Аналізуємо та оновлюємо БД...`);

        const deals = this.marketAnalyzerService.findProfitableDeals(parsedData);
        await this.notificationService.processAlerts(deals);

        // await this.marketSyncService.syncFullMarket(parsedData);
      } catch (error) {
        this.logger.error('[MarketSync] Помилка синхронізації ринку', error);
      }
    }
  }
}
