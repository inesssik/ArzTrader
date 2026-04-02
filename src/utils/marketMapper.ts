import { ListingTypes, type Lavka, type ParsedListing } from '../types/types';

export function parseGlobalMarket(rawData: Lavka[]): ParsedListing[] {
  const allListings: ParsedListing[] = [];

  for (const stall of rawData) {
    const timestamp = new Date(stall.ostime * 1000);

    if (stall.items_sell && stall.items_sell.length > 0) {
      stall.items_sell.forEach((itemName, index) => {
        allListings.push({
          itemName,
          type: ListingTypes.SELL,
          price: stall.price_sell[index]!,
          quantity: stall.count_sell[index]!,
          username: stall.username,
          lavkaUid: stall.LavkaUid,
          serverId: stall.serverId,
          timestamp
        });
      });
    }

    if (stall.items_buy && stall.items_buy.length > 0) {
      stall.items_buy.forEach((itemName, index) => {
        allListings.push({
          itemName,
          type: ListingTypes.BUY,
          price: stall.price_buy[index]!,
          quantity: stall.count_buy[index]!,
          username: stall.username,
          lavkaUid: stall.LavkaUid,
          serverId: stall.serverId,
          timestamp
        });
      });
    }
  }

  return allListings;
}