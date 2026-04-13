import { singleton } from 'tsyringe';
import { ConfigService } from '../../config/ConfigService';
import { ListingTypes, type ParsedListing, type ProfitableDeal } from '../../types/types';

@singleton()
export class MarketAnalyzerService {
  // Кэш максимальных цен скупки с Vice City (Server 0)
  private vcMaxBuyPrices = new Map<string, number>();

  // Топ 10 цен скупки со всех серверов для каждого товара
  private globalMaxBuyPrices = new Map<string, number[]>();

  constructor(private readonly config: ConfigService) {}

  // 1. Сначала обновляем цены скупки с VC
  public updateVCPrices(vcListings: ParsedListing[]): void {
    this.vcMaxBuyPrices.clear();
    const vcMultiplier = this.config.values.VC_PRICE_CURRENCY;

    const itemGroups = new Map<string, number[]>();

    // Группируем только скупку (BUY)
    for (const listing of vcListings) {
      if (listing.type === ListingTypes.BUY) {
        if (!itemGroups.has(listing.itemName)) {
          itemGroups.set(listing.itemName, []);
        }
        itemGroups.get(listing.itemName)!.push(listing.price * vcMultiplier);
      }
    }

    // Находим и сохраняем максимум для каждого товара
    for (const [itemName, prices] of itemGroups.entries()) {
      const maxBuyPrice = Math.max(...prices);
      const maxBuyPriceInVC = maxBuyPrice / vcMultiplier;

      if (maxBuyPriceInVC > this.config.values.MIN_MAXBUYPRICE) {
        this.vcMaxBuyPrices.set(itemName, maxBuyPrice);
      }
    }
  }

  // 1.1 Обновляем глобальные цены скупки (все сервера)
  public updateGlobalBuyPrices(listings: ParsedListing[]): void {
    const vcMultiplier = this.config.values.VC_PRICE_CURRENCY;

    for (const listing of listings) {
      if (listing.type === ListingTypes.BUY) {
        const normalizedPrice = listing.serverId === 0 ? listing.price * vcMultiplier : listing.price;

        if (normalizedPrice <= this.config.values.MIN_MAXBUYPRICE) continue;

        let prices = this.globalMaxBuyPrices.get(listing.itemName) || [];

        // Добавляем цену и держим только топ 10 самых высоких лотов
        prices.push(normalizedPrice);
        prices.sort((a, b) => b - a);

        if (prices.length > 10) {
          prices = prices.slice(0, 10);
        }

        this.globalMaxBuyPrices.set(listing.itemName, prices);
      }
    }
  }

  // 2. Ищем профит для конкретного сервера (работает мгновенно)
  public findProfitableDeals(listings: ParsedListing[]): ProfitableDeal[] {
    const deals: ProfitableDeal[] = [];
    const vcMultiplier = this.config.values.VC_PRICE_CURRENCY;

    // Ищем только лоты на ПРОДАЖУ
    const sellListings = listings.filter(l => l.type === ListingTypes.SELL);

    for (const listing of sellListings) {
      let maxBuyPrice = this.vcMaxBuyPrices.get(listing.itemName);
      let isVCPrice = true;

      // Если на VC цены нет, пробуем взять среднюю из топ-10 по всем серверам
      if (!maxBuyPrice) {
        const globalPrices = this.globalMaxBuyPrices.get(listing.itemName);
        if (globalPrices && globalPrices.length > 0) {
          maxBuyPrice = globalPrices.reduce((a, b) => a + b, 0) / globalPrices.length;
          isVCPrice = false;
        }
      }

      if (!maxBuyPrice) continue;

      const currentListingStandardPrice = listing.serverId === 0 ? listing.price * vcMultiplier : listing.price;
      if (currentListingStandardPrice >= maxBuyPrice) continue;

      const diff = maxBuyPrice - currentListingStandardPrice;
      const deviation = (diff / maxBuyPrice) * 100;

      if (deviation >= this.config.values.MIN_DEVIATION_PERCENT) {
        deals.push({
          listing,
          baseAvgPrice: maxBuyPrice,
          deviation,
          profit: diff,
          isVCPrice
        });
      }
    }

    return deals;
  }
}
