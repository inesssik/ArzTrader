import { singleton } from 'tsyringe';
import { ConfigService } from '../../config/ConfigService';
import { ListingTypes, type ParsedListing, type ProfitableDeal } from '../../types/types';

@singleton()
export class MarketAnalyzerService {
  constructor(private readonly config: ConfigService) {}

  public findProfitableDeals(listings: ParsedListing[]): ProfitableDeal[] {
    const deals: ProfitableDeal[] = [];
    const vcMultiplier = this.config.values.VC_PRICE_CURRENCY;

    // 1. Групуємо ВСІ лоти (BUY та SELL) по назві товару
    const itemGroups = new Map<string, ParsedListing[]>();
    for (const listing of listings) {
      if (!itemGroups.has(listing.itemName)) {
        itemGroups.set(listing.itemName, []);
      }
      itemGroups.get(listing.itemName)!.push(listing);
    }

    // 2. Аналізуємо кожну групу товарів
    for (const [itemName, groupListings] of itemGroups.entries()) {
      // Фільтруємо лоти на СКУПКУ (BUY) на 0 сервері (VC) і одразу отримуємо їх ціни у SA-доларах
      const vcBuyPrices = groupListings
        .filter(l => l.serverId === 0 && l.type === ListingTypes.BUY)
        .map(l => l.price * vcMultiplier);

      if (vcBuyPrices.length === 0) continue; // На VC немає скупки цього товару, пропускаємо

      // 3. Шукаємо МАКСИМАЛЬНУ ціну скупки
      const maxBuyPrice = Math.max(...vcBuyPrices);

      if (maxBuyPrice <= 0) continue;

      const maxBuyPriceInVC = maxBuyPrice / vcMultiplier;
      // Залишаємо мінімальний поріг вартості
      if (maxBuyPriceInVC <= 100000) {
        continue;
      }

      // 4. Шукаємо вигідні лоти на ПРОДАЖ (SELL) по ВСІМ серверам
      const sellListings = groupListings.filter(l => l.type === ListingTypes.SELL);

      for (const listing of sellListings) {
        // Приводимо ціну поточного лота до звичайної валюти
        const currentListingStandardPrice = listing.serverId === 0 ? listing.price * vcMultiplier : listing.price;

        // Якщо ціна продажу більша або дорівнює максимальній ціні скупки — це невигідно
        if (currentListingStandardPrice >= maxBuyPrice) continue;

        // Рахуємо відсоток відхилення (наскільки товар дешевший за макс. скупку)
        const deviation = ((maxBuyPrice - currentListingStandardPrice) / maxBuyPrice) * 100;

        if (deviation >= this.config.values.MIN_DEVIATION_PERCENT) {
          deals.push({
            listing,
            baseAvgPrice: maxBuyPrice, // Залишив стару назву поля (baseAvgPrice) для сумісності з інтерфейсом
            deviation
          });
        }
      }
    }

    return deals;
  }
}