import pgFormat from 'pg-format';
import { singleton } from 'tsyringe';
import { ConfigService } from './ConfigService';
import { LoggerService } from './LoggerService';
import { PrismaService } from './PrismaService';
import { ListingTypes, type ParsedListing } from './types/types';
import type { Prisma } from '../prisma/generated/prisma/client';

@singleton()
export class LavkaService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService
  ) {}

  private async syncListing(listings: ParsedListing[], itemMap: Map<string, number>) {
    const liveMarketData = listings.map(l => ({
      itemId: itemMap.get(l.itemName)!,
      type: l.type,
      price: l.price,
      quantity: l.quantity,
      username: l.username,
      lavkaUid: l.lavkaUid,
      serverId: l.serverId,
      timestamp: l.timestamp
    }));

    const CHUNK_SIZE = 4000;

    try {
      await this.prismaService.$transaction(
        async tx => {
          this.loggerService.info(`[SYNC] Створення тимчасової таблиці...`);
          await tx.$executeRawUnsafe(`
            CREATE TEMP TABLE "market_listing_temp" (LIKE "market_listing" INCLUDING ALL) ON COMMIT DROP;
          `);

          this.loggerService.info(`[SYNC] Заповнення тимчасової таблиці...`);
          for (let i = 0; i < liveMarketData.length; i += CHUNK_SIZE) {
            const chunk = liveMarketData.slice(i, i + CHUNK_SIZE);

            const values = chunk.map(item => [
              item.itemId,
              item.type,
              item.price,
              item.quantity,
              item.username,
              item.lavkaUid,
              item.serverId,
              item.timestamp.toISOString()
            ]);

            const query = pgFormat(
              'INSERT INTO "market_listing_temp" ("itemId", "type", "price", "quantity", "username", "lavkaUid", "serverId", "timestamp") VALUES %L ON CONFLICT DO NOTHING;',
              values
            );

            await tx.$executeRawUnsafe(query);

            this.loggerService.info(
              `[SYNC] [Shadow] Завантажено ${Math.min(i + CHUNK_SIZE, liveMarketData.length)} записів`
            );
          }

          this.loggerService.info(`[SYNC] Швидка підміна даних ринку...`);
          await tx.$executeRawUnsafe(`TRUNCATE TABLE "market_listing" RESTART IDENTITY;`);
          await tx.$executeRawUnsafe(`INSERT INTO "market_listing" SELECT * FROM "market_listing_temp";`);
        },
        {
          maxWait: 15000,
          timeout: 120000
        }
      );
    } catch (error) {
      this.loggerService.error(`[SYNC] КРИТИЧНА ПОМИЛКА ОНОВЛЕННЯ РИНКУ:`, error);
      throw error;
    }
  }

  async syncFullMarket(listings: ParsedListing[]) {
    if (listings.length === 0) {
      this.loggerService.info(`[SYNC] Немає товарів для синхронізації...`);
      return;
    }

    this.loggerService.info(`[SYNC] Початок синхронізації ${listings.length} товарів...`);

    const uniqueItemNames = [...new Set(listings.map(l => l.itemName))];
    await this.prismaService.item.createMany({
      data: uniqueItemNames.map(name => ({ name })),
      skipDuplicates: true
    });

    const items = await this.prismaService.item.findMany({
      where: { name: { in: uniqueItemNames } }
    });
    const itemMap = new Map(items.map(i => [i.name, i.id]));

    await this.syncListing(listings, itemMap);
    await this.syncHistoryBackground(listings, itemMap);

    this.loggerService.info(`[SYNC] Синхронізація успішно завершена!`);
  }

  private async syncHistoryBackground(listings: ParsedListing[], itemMap: Map<string, number>) {
    this.loggerService.info(`[SYNC] Початок оновлення історії...`);
    const timeoutThreshold = new Date(Date.now() - this.configService.values.SESSION_TIMEOUT_MINUTES * 60 * 1000);
    const syncTimestamp = listings[0]?.timestamp || new Date();
    const CHUNK_SIZE = 4000;

    try {
      const recentHistory = await this.prismaService.playerStallHistory.findMany({
        where: { lastSeen: { gte: timeoutThreshold } },
        select: { id: true, username: true, itemId: true, type: true, price: true, serverId: true }
      });

      const activeSessionsMap = new Map(
        recentHistory.map(h => [`${h.username}_${h.itemId}_${h.type}_${h.price}_${h.serverId}`, h.id])
      );

      const historyCreates: Prisma.PlayerStallHistoryCreateManyInput[] = [];
      const historyUpdateIds = new Set<number>();
      const createdSessionsInCurrentSync = new Set<string>();

      for (const l of listings) {
        const itemId = itemMap.get(l.itemName)!;
        const sessionKey = `${l.username}_${itemId}_${l.type}_${l.price}_${l.serverId}`;
        const activeHistoryId = activeSessionsMap.get(sessionKey);

        if (activeHistoryId) {
          historyUpdateIds.add(activeHistoryId);
        } else if (!createdSessionsInCurrentSync.has(sessionKey)) {
          historyCreates.push({
            username: l.username,
            itemId: itemId,
            type: l.type,
            price: l.price,
            serverId: l.serverId,
            firstSeen: l.timestamp,
            lastSeen: l.timestamp
          });
          createdSessionsInCurrentSync.add(sessionKey);
        }
      }

      if (historyCreates.length > 0) {
        this.loggerService.info(`[SYNC] Створення ${historyCreates.length} нових записів в історії...`);
        for (let i = 0; i < historyCreates.length; i += CHUNK_SIZE) {
          const chunk = historyCreates.slice(i, i + CHUNK_SIZE);
          await this.prismaService.playerStallHistory.createMany({ data: chunk, skipDuplicates: true });
        }
      }

      if (historyUpdateIds.size > 0) {
        const idsToUpdate = Array.from(historyUpdateIds);
        this.loggerService.info(`[SYNC] Оновлення часу для ${idsToUpdate.length} існуючих сесій...`);
        for (let i = 0; i < idsToUpdate.length; i += CHUNK_SIZE) {
          const chunkIds = idsToUpdate.slice(i, i + CHUNK_SIZE);
          await this.prismaService.playerStallHistory.updateMany({
            where: { id: { in: chunkIds } },
            data: { lastSeen: syncTimestamp }
          });
        }
      }

      this.loggerService.info(`[SYNC] Історія успішно оновлена!`);
    } catch (error) {
      this.loggerService.error(`[SYNC] Помилка оновлення історії:`, error);
    }
  }

  private async getMarketAnalytics(itemName: string, serverId: number, deviationPercent: number) {
    const top3 = await this.prismaService.marketListing.findMany({
      where: {
        item: { name: itemName },
        serverId: serverId,
        type: ListingTypes.SELL
      },
      orderBy: { price: 'asc' },
      take: 3
    });

    if (top3.length === 0) {
      return { message: 'Товар не знайдено на ринку' };
    }

    const sum = top3.reduce((acc, curr) => acc + curr.price, 0);
    const averagePrice = Math.round(sum / top3.length);

    const lowerBound = averagePrice * (1 - deviationPercent / 100);
    const upperBound = averagePrice * (1 + deviationPercent / 100);

    const anomalies = await this.prismaService.marketListing.findMany({
      where: {
        item: { name: itemName },
        serverId: serverId,
        type: ListingTypes.SELL,
        OR: [{ price: { lt: lowerBound } }, { price: { gt: upperBound } }]
      },
      orderBy: { price: 'asc' }
    });

    return {
      top3,
      averagePrice,
      anomalies
    };
  }

  async getProfitableDeals(deviationPercent: number) {
    const allSells = await this.prismaService.marketListing.findMany({
      where: { type: ListingTypes.SELL },
      include: { item: true }
    });

    const deals = [];
    const groups = new Map<number, typeof allSells>();

    for (const listing of allSells) {
      if (!groups.has(listing.itemId)) {
        groups.set(listing.itemId, []);
      }
      groups.get(listing.itemId)!.push(listing);
    }

    for (const [itemId, items] of groups.entries()) {
      if (items.length < 3) continue;

      const normalizedItems = items.map(item => ({
        ...item,
        normalizedPrice: item.serverId === 0 ? item.price * 100 : item.price
      }));

      normalizedItems.sort((a, b) => a.normalizedPrice - b.normalizedPrice);

      const top3 = normalizedItems.slice(0, 3);
      const sum = top3.reduce((acc, curr) => acc + curr.normalizedPrice, 0);
      const avgNormalizedPrice = sum / top3.length;

      const thresholdPrice = avgNormalizedPrice * (1 - deviationPercent / 100);

      for (const item of normalizedItems) {
        if (item.normalizedPrice <= thresholdPrice) {
          const actualDeviation = ((avgNormalizedPrice - item.normalizedPrice) / avgNormalizedPrice) * 100;

          deals.push({
            listing: item,
            normalizedPrice: item.normalizedPrice,
            avgNormalizedPrice: Math.round(avgNormalizedPrice),
            deviation: actualDeviation
          });
        } else {
          break;
        }
      }
    }

    return deals;
  }
}
