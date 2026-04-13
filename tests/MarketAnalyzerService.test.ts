import 'reflect-metadata';
import { expect, test, describe, beforeEach } from 'bun:test';
import { MarketAnalyzerService } from '../src/services/market/MarketAnalyzerService';
import { ListingTypes, type ParsedListing } from '../src/types/types';

describe('MarketAnalyzerService - Global Fallback', () => {
  let service: MarketAnalyzerService;
  const configMock = {
    values: {
      VC_PRICE_CURRENCY: 500,
      MIN_MAXBUYPRICE: 0,
      MIN_DEVIATION_PERCENT: 10
    }
  } as any;

  beforeEach(() => {
    service = new MarketAnalyzerService(configMock);
  });

  test('should use VC price as priority', () => {
    const vcListings: ParsedListing[] = [
      {
        itemName: 'Item A',
        type: ListingTypes.BUY,
        price: 10,
        serverId: 0,
        itemId: '1',
        quantity: 1,
        username: 'u',
        timestamp: new Date(),
        lavkaUid: 1
      }
    ];

    service.updateVCPrices(vcListings);

    const testListings: ParsedListing[] = [
      {
        itemName: 'Item A',
        type: ListingTypes.SELL,
        price: 3000,
        serverId: 1,
        itemId: '1',
        quantity: 1,
        username: 'u',
        timestamp: new Date(),
        lavkaUid: 2
      }
    ];

    const deals = service.findProfitableDeals(testListings);
    expect(deals.length).toBe(1);
    expect(deals[0]!.baseAvgPrice).toBe(5000); // 10 * 500
    expect(deals[0]!.isVCPrice).toBe(true);
  });

  test('should use average of top 10 from other servers if VC price is missing', () => {
    const otherListings: ParsedListing[] = [
      {
        itemName: 'Item B',
        type: ListingTypes.BUY,
        price: 2000,
        serverId: 1,
        itemId: '2',
        quantity: 1,
        username: 'u',
        timestamp: new Date(),
        lavkaUid: 3
      },
      {
        itemName: 'Item B',
        type: ListingTypes.BUY,
        price: 1000,
        serverId: 2,
        itemId: '2',
        quantity: 1,
        username: 'u',
        timestamp: new Date(),
        lavkaUid: 4
      }
    ];

    service.updateGlobalBuyPrices(otherListings);

    const testListings: ParsedListing[] = [
      {
        itemName: 'Item B',
        type: ListingTypes.SELL,
        price: 500,
        serverId: 3,
        itemId: '2',
        quantity: 1,
        username: 'u',
        timestamp: new Date(),
        lavkaUid: 5
      }
    ];

    const deals = service.findProfitableDeals(testListings);
    expect(deals.length).toBe(1);
    expect(deals[0]!.baseAvgPrice).toBe(1500); // (2000 + 1000) / 2
    expect(deals[0]!.isVCPrice).toBe(false);
  });

  test('should maintain only top 10 for average calculation', () => {
    const listings: ParsedListing[] = [];
    for (let i = 1; i <= 15; i++) {
      listings.push({
        itemName: 'Item C',
        type: ListingTypes.BUY,
        price: i * 1000,
        serverId: 1,
        itemId: '3',
        quantity: 1,
        username: 'u',
        timestamp: new Date(),
        lavkaUid: i
      });
    }

    service.updateGlobalBuyPrices(listings);

    const testListings: ParsedListing[] = [
      {
        itemName: 'Item C',
        type: ListingTypes.SELL,
        price: 100,
        serverId: 1,
        itemId: '3',
        quantity: 1,
        username: 'u',
        timestamp: new Date(),
        lavkaUid: 16
      }
    ];

    const deals = service.findProfitableDeals(testListings);
    expect(deals.length).toBe(1);
    // Top 10 are 15000, 14000, ..., 6000
    // Sum = (15000 + 6000) * 10 / 2 = 21000 * 5 = 105000
    // Avg = 10500
    expect(deals[0]!.baseAvgPrice).toBe(10500);
  });
});
