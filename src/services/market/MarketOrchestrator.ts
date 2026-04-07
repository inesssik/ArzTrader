import { singleton } from 'tsyringe';
import { ArzApiService } from '../../api/ArzApiService';
import { NotificationService } from '../../services/NotificationService';
import { LoggerService } from '../../utils/Logger';
import { parseGlobalMarket } from '../../utils/marketMapper';
import { MarketAnalyzerService } from './MarketAnalyzerService';
import { MarketSyncService } from './MarketSyncService';

@singleton()
export class MarketOrchestrator {
  // Звичайні сервери (без VC)
  private readonly REGULAR_SERVERS = Array.from({ length: 30 }, (_, i) => i + 1);

  constructor(
    private readonly apiService: ArzApiService,
    private readonly marketSyncService: MarketSyncService,
    private readonly logger: LoggerService,
    private readonly notificationService: NotificationService,
    private readonly marketAnalyzerService: MarketAnalyzerService
  ) {}

  public init() {
    this.syncTask();
  }

  private async syncTask() {
    while (true) {
      try {
        this.logger.info('[MarketSync] Починаємо новий цикл парсингу...');
        
        try {
          this.logger.debug(`[MarketSync] Отримання даних Vice City (Server 0)...`);
          const rawVCData = await this.apiService.getOnlines(0);
          
          if (rawVCData && rawVCData.length > 0) {
            const parsedVCData = parseGlobalMarket(rawVCData);
            this.marketAnalyzerService.updateVCPrices(parsedVCData);
            const vcDeals = this.marketAnalyzerService.findProfitableDeals(parsedVCData);
            await this.notificationService.processAlerts(vcDeals);
          }
        } catch (vcError) {
          this.logger.error(`[MarketSync] Помилка завантаження VC. Пропускаємо цикл.`, vcError);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; 
        }

        for (const serverId of this.REGULAR_SERVERS) {
          try {
            this.logger.info(`[MarketSync] Завантаження сервера ${serverId}...`);
            const rawData = await this.apiService.getOnlines(serverId);
            
            if (rawData && rawData.length > 0) {
              const parsedData = parseGlobalMarket(rawData);
              
              const deals = this.marketAnalyzerService.findProfitableDeals(parsedData);
              await this.notificationService.processAlerts(deals);
            }
          } catch (serverError) {
             this.logger.error(`[MarketSync] Помилка завантаження сервера ${serverId}`, serverError);
          }
        }

      } catch (error) {
        this.logger.error('[MarketSync] Глобальна помилка синхронізації', error);
      }

      this.logger.info('[MarketSync] Очікування перед наступним циклом...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}