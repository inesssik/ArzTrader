import { singleton } from 'tsyringe';
import { ConfigService } from '../../config/ConfigService';
import { ListingTypes, type ParsedListing, type ProfitableDeal } from '../../types/types';

@singleton()
export class MarketAnalyzerService {
  // Кэш максимальных цен скупки с Vice City (Server 0)
  private vcMaxBuyPrices = new Map<string, number>();

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

  // 2. Ищем профит для конкретного сервера (работает мгновенно)
  public findProfitableDeals(listings: ParsedListing[]): ProfitableDeal[] {
    const deals: ProfitableDeal[] = [];
    const vcMultiplier = this.config.values.VC_PRICE_CURRENCY;

    // Ищем только лоты на ПРОДАЖУ
    const sellListings = listings.filter(l => l.type === ListingTypes.SELL);

    for (const listing of sellListings) {
      // Берем макс. цену скупки из кэша VC
      const maxBuyPrice = this.vcMaxBuyPrices.get(listing.itemName);

      if (!maxBuyPrice) continue; // Нет скупки на VC для этого товара

      const currentListingStandardPrice = listing.serverId === 0 ? listing.price * vcMultiplier : listing.price;

      if (currentListingStandardPrice >= maxBuyPrice) continue;

      const deviation = ((maxBuyPrice - currentListingStandardPrice) / maxBuyPrice) * 100;

      if (deviation >= this.config.values.MIN_DEVIATION_PERCENT) {
        deals.push({
          listing,
          baseAvgPrice: maxBuyPrice,
          deviation
        });
      }
    }

    return deals;
  }
}
