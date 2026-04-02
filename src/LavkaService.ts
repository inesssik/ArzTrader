import { singleton } from 'tsyringe';
import type { PrismaService } from './PrismaService';
import { ListingTypes, type ParsedListing } from './types/types';

@singleton()
export class LavkaService {
  // 15 хвилин таймаут для сесії гравця (якщо парсинг кожні 5 хв)
  private readonly SESSION_TIMEOUT_MINUTES = 15;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Головний метод. Викликається, коли прийшов новий гігантський JSON.
   */
  async syncFullMarket(listings: ParsedListing[]) {
    if (listings.length === 0) return;

    console.log(`[SYNC] Початок синхронізації ${listings.length} товарів...`);

    // 1. Гарантуємо наявність усіх предметів у базі
    const uniqueItemNames = [...new Set(listings.map(l => l.itemName))];
    for (const name of uniqueItemNames) {
      await this.prisma.item.upsert({
        where: { name },
        update: {},
        create: { name }
      });
    }

    const items = await this.prisma.item.findMany({
      where: { name: { in: uniqueItemNames } }
    });
    const itemMap = new Map(items.map(i => [i.name, i.id]));

    // 2. Готуємо дані для вставки в "Живий ринок"
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

    // 3. --- ЛОГІКА ІСТОРІЇ ГРАВЦІВ ---
    const timeoutThreshold = new Date(Date.now() - this.SESSION_TIMEOUT_MINUTES * 60 * 1000);

    // Дістаємо ВСІ активні сесії з бази (щоб не робити запити в циклі)
    const recentHistory = await this.prisma.playerStallHistory.findMany({
      where: { lastSeen: { gte: timeoutThreshold } },
      select: { id: true, username: true, itemId: true, type: true, price: true, serverId: true }
    });

    // Робимо швидку мапу: "username_itemId_type_price_serverId" -> historyId
    const activeSessionsMap = new Map(
      recentHistory.map(h => [`${h.username}_${h.itemId}_${h.type}_${h.price}_${h.serverId}`, h.id])
    );

    const historyOperations = [];
    const createdSessions = new Set<string>(); // Щоб не дублювати create в межах одного парсингу

    for (const l of listings) {
      const itemId = itemMap.get(l.itemName)!;
      const sessionKey = `${l.username}_${itemId}_${l.type}_${l.price}_${l.serverId}`;
      const activeHistoryId = activeSessionsMap.get(sessionKey);

      if (activeHistoryId) {
        // Оновлюємо існуючу сесію
        historyOperations.push(
          this.prisma.playerStallHistory.update({
            where: { id: activeHistoryId },
            data: { lastSeen: l.timestamp }
          })
        );
      } else if (!createdSessions.has(sessionKey)) {
        // Створюємо нову сесію
        historyOperations.push(
          this.prisma.playerStallHistory.create({
            data: {
              username: l.username,
              itemId: itemId,
              type: l.type,
              price: l.price,
              serverId: l.serverId,
              firstSeen: l.timestamp,
              lastSeen: l.timestamp
            }
          })
        );
        createdSessions.add(sessionKey);
      }
    }

    await this.prisma.$transaction([
      this.prisma.marketListing.deleteMany({}),

      this.prisma.marketListing.createMany({
        data: liveMarketData
      }),

      ...historyOperations
    ]);

    console.log(`[SYNC] Ринок успішно оновлено!`);
  }

  async getMarketAnalytics(itemName: string, serverId: number, deviationPercent: number) {
    const top3 = await this.prisma.marketListing.findMany({
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

    // 2. Вираховуємо середню ціну з цих 3-х
    const sum = top3.reduce((acc, curr) => acc + curr.price, 0);
    const averagePrice = Math.round(sum / top3.length);

    // 3. Дивимось товари, які відрізняються на n% від середньої ціни (в меншу або більшу сторону)
    // Наприклад: якщо avg = 100000, а percent = 20%, то межі: 80000 та 120000
    const lowerBound = averagePrice * (1 - deviationPercent / 100);
    const upperBound = averagePrice * (1 + deviationPercent / 100);

    const anomalies = await this.prisma.marketListing.findMany({
      where: {
        item: { name: itemName },
        serverId: serverId,
        type: ListingTypes.SELL,
        OR: [
          { price: { lt: lowerBound } }, // дешевше норми
          { price: { gt: upperBound } } // дорожче норми
        ]
      },
      orderBy: { price: 'asc' }
    });

    return {
      top3,
      averagePrice,
      anomalies
    };
  }

  async getProfitableDeals(deviationPercent: number = 20) {
    // 1. Отримуємо всі товари на продаж з бази
    const allSells = await this.prisma.marketListing.findMany({
      where: { type: ListingTypes.SELL },
      include: { item: true }
    });

    const deals = [];
    const groups = new Map<number, typeof allSells>();

    // 2. Групуємо всі товари ЛИШЕ за предметом (глобальний ринок)
    for (const listing of allSells) {
      if (!groups.has(listing.itemId)) {
        groups.set(listing.itemId, []);
      }
      groups.get(listing.itemId)!.push(listing);
    }

    // 3. Аналізуємо кожен предмет глобально
    for (const [itemId, items] of groups.entries()) {
      // Якщо глобально менше 3-х товарів - немає з чим об'єктивно порівнювати
      if (items.length < 3) continue;

      // Нормалізуємо ціни для сортування (якщо сервер 0 -> множимо ціну на 100)
      const normalizedItems = items.map(item => ({
        ...item,
        normalizedPrice: item.serverId === 0 ? item.price * 100 : item.price
      }));

      // Сортуємо від найдешевшого до найдорожчого за НОРМАЛІЗОВАНОЮ ціною
      normalizedItems.sort((a, b) => a.normalizedPrice - b.normalizedPrice);

      // Беремо топ-3 найдешевших ГЛОБАЛЬНО
      const top3 = normalizedItems.slice(0, 3);
      const sum = top3.reduce((acc, curr) => acc + curr.normalizedPrice, 0);
      const avgNormalizedPrice = sum / top3.length;

      // Обчислюємо цільовий поріг (наприклад, -20%)
      const targetNormalizedPrice = avgNormalizedPrice * (1 - deviationPercent / 100);

      // Збираємо ВСІ товари, які дешевші за цільовий поріг
      for (const item of normalizedItems) {
        if (item.normalizedPrice <= targetNormalizedPrice) {
          deals.push({
            listing: item, // оригінальний товар (з оригінальною ціною)
            normalizedPrice: item.normalizedPrice,
            avgNormalizedPrice: Math.round(avgNormalizedPrice)
          });
        } else {
          // Оскільки масив відсортований, якщо ми дійшли до товару, який дорожче порогу - далі шукати немає сенсу
          break;
        }
      }
    }

    return deals;
  }
}
