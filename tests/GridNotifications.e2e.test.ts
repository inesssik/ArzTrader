import 'reflect-metadata';
import { expect, test, describe, mock, beforeEach } from 'bun:test';
import { NotificationService } from '../src/services/NotificationService';
import { ServersService } from '../src/services/ServersService';
import type { PrismaService } from '../src/database/PrismaService';
import type { BotService } from '../src/bot/BotService';
import type { RedisService } from '../src/database/RedisService';
import type { ConfigService } from '../src/config/ConfigService';
import type { LoggerService } from '../src/utils/Logger';
import { ListingTypes, type ProfitableDeal } from '../src/types/types';

describe('E2E Grid Notifications', () => {
  let notificationService: NotificationService;

  // Mock dependencies
  const mockPrisma = {
    userSubscription: {
      findMany: mock(() =>
        Promise.resolve([
          {
            userId: 'test_user_1',
            subscriptionId: 1, // MARKET_ALERTS
            settings: {
              deviationPercent: 40, // Global fallback
              useGrid: true,
              servers: 'ALL',
              grids: [{ minPrice: 10_000_000, maxPrice: 50_000_000, deviationPercent: 20 }],
              serverConfigs: {
                0: {
                  // Vice-City
                  deviationPercent: 99 // User demands 99% for VC
                }
              }
            }
          }
        ])
      )
    }
  };

  const mockBot = {
    sendMessage: mock(() => Promise.resolve())
  };

  const mockRedis = {
    setIfNotExists: mock(() => Promise.resolve(true)) // Always allow new deal
  };

  const mockConfig = {
    values: {
      DEAL_TTL_SECONDS: 60,
      VC_PRICE_CURRENCY: 100
    }
  };

  const mockLogger = {
    error: mock(() => {}),
    info: mock(() => {}),
    debug: mock(() => {})
  };

  beforeEach(() => {
    mockBot.sendMessage.mockClear();

    notificationService = new NotificationService(
      mockPrisma as unknown as PrismaService,
      mockBot as unknown as BotService,
      mockLogger as unknown as LoggerService,
      mockRedis as unknown as RedisService,
      mockConfig as unknown as ConfigService,
      new ServersService()
    );
  });

  test('should trigger notification on matching global grid (SA Server)', async () => {
    const deals: ProfitableDeal[] = [
      {
        listing: {
          itemId: '1',
          itemName: 'Test Item',
          type: ListingTypes.SELL,
          price: 20_000_000,
          quantity: 1,
          lavkaUid: 1,
          serverId: 1,
          username: 'test',
          timestamp: new Date()
        },
        baseAvgPrice: 30_000_000,
        deviation: 30, // 30% dev, which is >= 20% grid requirement for 20m SA
        profit: 10_000_000,
        isVCPrice: true
      }
    ];

    await notificationService.processAlerts(deals);

    // User should get a message!
    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    expect((mockBot.sendMessage.mock.calls as any)[0][0]).toBe('test_user_1'); // Check if correctly routed
  });

  test('should ignore notification on VC server due to 99% local restriction', async () => {
    const deals: ProfitableDeal[] = [
      {
        listing: {
          itemId: '2',
          itemName: 'VC Item',
          type: ListingTypes.SELL,
          price: 200_000, // VC price (equal to 20m SA)
          quantity: 1,
          lavkaUid: 1,
          serverId: 0,
          username: 'test',
          timestamp: new Date()
        },
        baseAvgPrice: 30_000_000, // Global SA avg
        deviation: 30, // 30% dev
        profit: 10_000_000,
        isVCPrice: true
      }
    ];

    await notificationService.processAlerts(deals);

    // User should NOT get a message because VC restricted to 99%!
    expect(mockBot.sendMessage).toHaveBeenCalledTimes(0);
  });

  test('should parse VC price correctly and match global grid if no local VC restriction', async () => {
    // Redefine prisma mock to not have VC restriction
    mockPrisma.userSubscription.findMany.mockImplementationOnce(() =>
      Promise.resolve([
        {
          userId: 'test_user_2',
          subscriptionId: 1,
          settings: {
            deviationPercent: 40,
            useGrid: true,
            servers: 'ALL',
            grids: [
              // Grid defined in SA bounds, e.g. 10m - 50m requires 20% dev
              { minPrice: 10_000_000, maxPrice: 50_000_000, deviationPercent: 20 }
            ],
            serverConfigs: {}
          }
        } as any
      ])
    );

    const deals: ProfitableDeal[] = [
      {
        listing: {
          itemId: '3',
          itemName: 'VC Item 2',
          type: ListingTypes.SELL,
          price: 200_000, // VC price, which is 20m SA! It fits inside 10m-50m SA grid.
          quantity: 1,
          lavkaUid: 1,
          serverId: 0,
          username: 'test',
          timestamp: new Date()
        },
        baseAvgPrice: 30_000_000, // Global SA avg
        deviation: 30, // 30% dev, greater than 20% grid requirement
        profit: 10_000_000,
        isVCPrice: true
      }
    ];

    await notificationService.processAlerts(deals);

    // User should get a message because 200_000 VC * 100 = 20_000_000 SA, matches grid!
    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
  });
});
