import cron from 'node-cron';
import { singleton } from 'tsyringe';
import { LoggerService } from '../utils/Logger';
import { PrismaService } from '../database/PrismaService';

@singleton()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService
  ) {}

  public init() {
    cron.schedule('0 * * * *', async () => {
      await this.captureSnapshot();
    });
  }

  private async captureSnapshot() {
    try {
      this.logger.info('[Stats] Збираємо зліпок ринку для графіків...');

      const activeItems = await this.prisma.marketListing.groupBy({
        by: ['itemId', 'type', 'serverId'],
        _min: { price: true },
        _max: { price: true },
        _avg: { price: true },
        _sum: { quantity: true },
        _count: { id: true }
      });

      if (activeItems.length === 0) return;

      // У спрощеному варіанті використовуємо середню ціну (avg),
      // якщо розрахунок медіани буде вантажити БД.
      const historyData = activeItems.map(stats => ({
        itemId: stats.itemId,
        type: stats.type,
        serverId: stats.serverId,
        minPrice: stats._min.price ?? 0,
        maxPrice: stats._max.price ?? 0,
        avgPrice: stats._avg.price ?? 0,
        medianPrice: stats._avg.price ?? 0, // Тимчасово прирівнюємо до avg
        totalVolume: stats._sum.quantity ?? 0,
        listingsCount: stats._count.id,
        timestamp: new Date()
      }));

      await this.prisma.priceHistory.createMany({ data: historyData });
      this.logger.info('[Stats] Зліпок успішно збережено!');
    } catch (error) {
      this.logger.error('[Stats] Помилка збору статистики', error);
    }
  }
}
