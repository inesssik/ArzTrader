import cron from 'node-cron';
import { singleton } from 'tsyringe';
import { ArzApiService } from './ArzApiService';
import { LavkaService } from './LavkaService';
import { LoggerService } from './LoggerService';
import { parseGlobalMarket } from './utils/marketMapper';
import { BotService } from './BotService';

@singleton()
export class MarketSyncService {
  private notifiedDeals = new Set<string>();

  constructor(
    private readonly apiService: ArzApiService,
    private readonly lavkaService: LavkaService,
    private readonly logger: LoggerService,
    private readonly botService: BotService
  ) {}

  public init() {
    cron.schedule('*/1 * * * *', async () => {
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

      const deals = await this.lavkaService.getProfitableDeals(20);
      
      const currentDealKeys = new Set<string>();

      for (const deal of deals) {
        const { listing } = deal;
        const dealKey = `${listing.username}_${listing.itemId}_${listing.price}_${listing.serverId}`;
        currentDealKeys.add(dealKey);

        if (!this.notifiedDeals.has(dealKey)) {
          this.notifiedDeals.add(dealKey);
          // await this.botService.sendDealAlert(deal);
          this.logger.info(`[Alert] Відправлено сповіщення про вигідний ${listing.item.name} (${listing.price}$)`);
        }
      }

      for (const key of this.notifiedDeals) {
        if (!currentDealKeys.has(key)) {
          this.notifiedDeals.delete(key);
        }
      }

    } catch (error) {
      this.logger.error('[MarketSync] Помилка синхронізації ринку', error);
    }
  }
}