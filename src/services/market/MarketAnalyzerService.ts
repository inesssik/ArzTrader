import { singleton } from 'tsyringe';
import { ConfigService } from '../../config/ConfigService';
import { ListingTypes, type ParsedListing, type ProfitableDeal } from '../../types/types';

@singleton()
export class MarketAnalyzerService {
  // Кеш максимальних цін скупки з Vice City (Server 0)
  private vcMaxBuyPrices = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  // 1. Спочатку оновлюємо ціни скупки з VC
  public updateVCPrices(vcListings: ParsedListing[]): void {
    this.vcMaxBuyPrices.clear();
    const vcMultiplier = this.config.values.VC_PRICE_CURRENCY;

    const itemGroups = new Map<string, number[]>();

    // Групуємо тільки скупку (BUY)
    for (const listing of vcListings) {
      if (listing.type === ListingTypes.BUY) {
        if (!itemGroups.has(listing.itemName)) {
          itemGroups.set(listing.itemName, []);
        }
        itemGroups.get(listing.itemName)!.push(listing.price * vcMultiplier);
      }
    }

    // Знаходимо і зберігаємо максимум для кожного товару
    for (const [itemName, prices] of itemGroups.entries()) {
      const maxBuyPrice = Math.max(...prices);
      const maxBuyPriceInVC = maxBuyPrice / vcMultiplier;

      if (maxBuyPriceInVC > this.config.values.MIN_MAXBUYPRICE) {
        this.vcMaxBuyPrices.set(itemName, maxBuyPrice);
      }
    }
  }

  // 2. Шукаємо профіт для конкретного сервера (працює миттєво)
  public findProfitableDeals(listings: ParsedListing[]): ProfitableDeal[] {
    const deals: ProfitableDeal[] = [];
    const vcMultiplier = this.config.values.VC_PRICE_CURRENCY;

    // Шукаємо тільки лоти на ПРОДАЖ
    const sellListings = listings.filter(l => l.type === ListingTypes.SELL);

    for (const listing of sellListings) {
      // Беремо макс. ціну скупки з кешу VC
      const maxBuyPrice = this.vcMaxBuyPrices.get(listing.itemName);

      if (!maxBuyPrice) continue; // Немає скупки на VC для цього товару

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
