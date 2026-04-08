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
        this.logger.info('[MarketSync] Починаємо новий цикл парсингу...');

        // 1. Спочатку завантажуємо Vice City, оскільки він оновлює базові ціни (updateVCPrices)
        try {
          this.logger.debug(`[MarketSync] Отримання даних Vice City (Server 0)...`);
          const rawVCData = await this.apiService.getOnlines(0);

          if (rawVCData && rawVCData.length > 0) {
            const parsedVCData = parseGlobalMarket(rawVCData);
            
            // Оновлюємо ціни VC перед тим, як аналізувати звичайні сервери
            this.marketAnalyzerService.updateVCPrices(parsedVCData);
            
            const vcDeals = this.marketAnalyzerService.findProfitableDeals(parsedVCData);
            await this.notificationService.processAlerts(vcDeals);
          }
        } catch (vcError) {
          this.logger.error(`[MarketSync] Помилка завантаження VC. Пропускаємо цикл.`, vcError);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; // Якщо немає еталонних цін VC, далі йти немає сенсу
        }

        // 2. Паралельний парсинг усіх інших серверів через Promise.all
        this.logger.info(`[MarketSync] Запуск паралельного завантаження ${this.REGULAR_SERVERS.length} серверів...`);
        
        const serverPromises = this.REGULAR_SERVERS.map(async (serverId) => {
          try {
            const rawData = await this.apiService.getOnlines(serverId);

            if (rawData && rawData.length > 0) {
              const parsedData = parseGlobalMarket(rawData);
              const deals = this.marketAnalyzerService.findProfitableDeals(parsedData);
              await this.notificationService.processAlerts(deals);
            }
          } catch (serverError) {
            // Перехоплюємо помилку тут, щоб Promise.all не впав повністю через один сервер
            this.logger.error(`[MarketSync] Помилка завантаження сервера ${serverId}`, serverError);
          }
        });

        // Чекаємо завершення парсингу всіх 32 серверів
        await Promise.all(serverPromises);

        this.logger.info('[MarketSync] Цикл завершено успішно.');

      } catch (error) {
        this.logger.error('[MarketSync] Глобальна помилка синхронізації', error);
      }

      this.logger.info('[MarketSync] Очікування перед наступним циклом...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Затримка 1 сек (можливо, варто збільшити)
    }
  }
}