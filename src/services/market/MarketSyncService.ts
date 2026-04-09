import pgFormat from 'pg-format';
import { singleton } from 'tsyringe';
import type { Prisma } from '../../../prisma/generated/prisma/client';
import { ConfigService } from '../../config/ConfigService';
import { PrismaService } from '../../database/PrismaService';
import { type ParsedListing } from '../../types/types';
import { LoggerService } from '../../utils/Logger';

@singleton()
export class MarketSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService
  ) {}

  async syncFullMarket(listings: ParsedListing[]) {
    if (listings.length === 0) {
      this.logger.info(`[SYNC] Нет товаров для синхронизации...`);
      return;
    }

    this.logger.info(`[SYNC] Начало синхронизации ${listings.length} товаров...`);

    const uniqueItemNames = [...new Set(listings.map(l => l.itemName))];
    await this.prisma.item.createMany({
      data: uniqueItemNames.map(name => ({ name })),
      skipDuplicates: true
    });

    const items = await this.prisma.item.findMany({
      where: { name: { in: uniqueItemNames } }
    });
    const itemMap = new Map(items.map(i => [i.name, i.id]));

    // await this.syncListing(listings, itemMap);
    await this.syncHistoryBackground(listings, itemMap);

    this.logger.info(`[SYNC] Синхронизация успешно завершена!`);
  }

  private async syncHistoryBackground(listings: ParsedListing[], itemMap: Map<string, number>) {
    this.logger.info(`[SYNC] Начало обновления истории...`);
    const timeoutThreshold = new Date(Date.now() - this.config.values.SESSION_TIMEOUT_MINUTES * 60 * 1000);
    const syncTimestamp = listings[0]?.timestamp || new Date();
    const CHUNK_SIZE = 4000;

    try {
      const recentHistory = await this.prisma.playerStallHistory.findMany({
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
        this.logger.info(`[SYNC] Создание ${historyCreates.length} новых записей в истории...`);
        for (let i = 0; i < historyCreates.length; i += CHUNK_SIZE) {
          const chunk = historyCreates.slice(i, i + CHUNK_SIZE);
          await this.prisma.playerStallHistory.createMany({ data: chunk, skipDuplicates: true });
        }
      }

      if (historyUpdateIds.size > 0) {
        const idsToUpdate = Array.from(historyUpdateIds);
        this.logger.info(`[SYNC] Обновление времени для ${idsToUpdate.length} существующих сессий...`);
        for (let i = 0; i < idsToUpdate.length; i += CHUNK_SIZE) {
          const chunkIds = idsToUpdate.slice(i, i + CHUNK_SIZE);
          await this.prisma.playerStallHistory.updateMany({
            where: { id: { in: chunkIds } },
            data: { lastSeen: syncTimestamp }
          });
        }
      }

      this.logger.info(`[SYNC] История успешно обновлена!`);
    } catch (error) {
      this.logger.error(`[SYNC] Ошибка обновления истории:`, error);
    }
  }
}
