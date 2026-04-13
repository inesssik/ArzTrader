import { singleton } from 'tsyringe';
import { ArzApiService } from '../../api/ArzApiService';
import { NotificationService } from '../../services/NotificationService';
import { LoggerService } from '../../utils/Logger';
import { parseGlobalMarket } from '../../utils/marketMapper';
import { MarketAnalyzerService } from './MarketAnalyzerService';
// import { MarketSyncService } from './MarketSyncService'; // Не используется в конструкторе, можно убрать если не нужен

@singleton()
export class MarketOrchestrator {
  private readonly REGULAR_SERVERS = Array.from({ length: 32 }, (_, i) => i + 1);

  constructor(
    private readonly apiService: ArzApiService,
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
        this.logger.info('[MarketSync] Начинаем новый цикл парсинга...');

        // 1. Сначала загружаем Vice City, так как он обновляет базовые цены (updateVCPrices)
        try {
          this.logger.debug(`[MarketSync] Получение данных Vice City (Server 0)...`);
          const rawVCData = await this.apiService.getOnlines(0);

          if (rawVCData && rawVCData.length > 0) {
            const parsedVCData = parseGlobalMarket(rawVCData);

            // Обновляем цены VC перед анализом обычных серверов
            this.marketAnalyzerService.updateVCPrices(parsedVCData);
            this.marketAnalyzerService.updateGlobalBuyPrices(parsedVCData);

            const vcDeals = this.marketAnalyzerService.findProfitableDeals(parsedVCData);
            await this.notificationService.processAlerts(vcDeals);
          }
        } catch (vcError) {
          this.logger.error(`[MarketSync] Ошибка загрузки VC. Пропускаем цикл: ${(vcError as Error).message}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; // Если нет эталонных цен VC, дальше идти нет смысла
        }

        // 2. Параллельный парсинг всех остальных серверов через Promise.all
        this.logger.info(`[MarketSync] Запуск параллельной загрузки ${this.REGULAR_SERVERS.length} серверов...`);

        const serverPromises = this.REGULAR_SERVERS.map(async serverId => {
          try {
            const rawData = await this.apiService.getOnlines(serverId);

            if (rawData && rawData.length > 0) {
              const parsedData = parseGlobalMarket(rawData);
              this.marketAnalyzerService.updateGlobalBuyPrices(parsedData);
              const deals = this.marketAnalyzerService.findProfitableDeals(parsedData);
              await this.notificationService.processAlerts(deals);
            }
          } catch (serverError) {
            this.logger.error(`[MarketSync] Ошибка загрузки сервера ${serverId}: ${(serverError as Error).message}`);
          }
        });

        await Promise.all(serverPromises);
        this.logger.info('[MarketSync] Цикл завершен успешно.');
      } catch (error) {
        this.logger.error('[MarketSync] Глобальная ошибка синхронизации', error);
      }

      this.logger.info('[MarketSync] Ожидание перед следующим циклом...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
