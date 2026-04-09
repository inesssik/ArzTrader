import { type Lavka, ListingTypes, type ParsedListing } from '../types/types';
import fs from 'fs/promises';

const items = JSON.parse(await fs.readFile('./src/data/items.json', { encoding: 'utf-8' })) as Record<string, string>;


function resolveItemInfo(rawItem: string | number): { itemId: string; itemName: string } {
  const rawItemId = String(rawItem);

  const braceIndex = rawItemId.indexOf('(');

  if (braceIndex === -1) {
    return {
      itemId: rawItemId,
      itemName: items[rawItemId] ?? 'Undefined'
    };
  }

  const baseId = rawItemId.slice(0, braceIndex);
  const modifier = rawItemId.slice(braceIndex);
  const baseName = items[baseId] ?? 'Undefined';

  return {
    itemId: rawItemId,
    itemName: `${baseName} ${modifier}`
  };
}

export function parseGlobalMarket(rawData: Lavka[]): ParsedListing[] {
  const allListings: ParsedListing[] = [];

  for (const stall of rawData) {
    const timestamp = new Date(stall.ostime * 1000);

    if (stall.items_sell && stall.items_sell.length > 0) {
      for (let i = 0; i < stall.items_sell.length; i++) {
        const rawItemId = stall.items_sell[i]!;
        const { itemId, itemName } = resolveItemInfo(rawItemId);

        allListings.push({
          itemId,
          itemName,
          type: ListingTypes.SELL,
          price: stall.price_sell[i]!,
          quantity: stall.count_sell[i]!,
          username: stall.username,
          lavkaUid: stall.LavkaUid,
          serverId: stall.serverId,
          timestamp
        });
      }
    }

    if (stall.items_buy && stall.items_buy.length > 0) {
      for (let i = 0; i < stall.items_buy.length; i++) {
        const rawItemId = stall.items_buy[i]!;
        const { itemId, itemName } = resolveItemInfo(rawItemId);

        allListings.push({
          itemId,
          itemName,
          type: ListingTypes.BUY,
          price: stall.price_buy[i]!,
          quantity: stall.count_buy[i]!,
          username: stall.username,
          lavkaUid: stall.LavkaUid,
          serverId: stall.serverId,
          timestamp
        });
      }
    }
  }

  return allListings;
}
