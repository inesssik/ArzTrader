import 'reflect-metadata';
import { expect, test, describe } from 'bun:test';
import { ServersService } from '../src/services/ServersService';
import type { MarketAlertSettings } from '../src/types/types';

describe('ServersService - getRequiredDeviation', () => {
  const service = new ServersService();

  test('should return global deviation percent if no grids and no server configs', () => {
    const settings: MarketAlertSettings = {
      deviationPercent: 40,
      servers: 'ALL'
    };
    const deviation = service.getRequiredDeviation(settings, 1, 1000);
    expect(deviation).toBe(40);
  });

  test('should use global grid if price matches', () => {
    const settings: MarketAlertSettings = {
      deviationPercent: 40,
      useGrid: true,
      grids: [
        { minPrice: 0, maxPrice: 1000, deviationPercent: 50 },
        { minPrice: 1001, maxPrice: 10000, deviationPercent: 30 }
      ],
      servers: 'ALL'
    };
    
    // Match first grid rule
    expect(service.getRequiredDeviation(settings, 1, 500)).toBe(50);
    
    // Match second grid rule
    expect(service.getRequiredDeviation(settings, 1, 5000)).toBe(30);

    // Fallback to global deviation if no grid matches
    expect(service.getRequiredDeviation(settings, 1, 20000)).toBe(40);
  });

  test('should override with server config if provided', () => {
    const settings: MarketAlertSettings = {
      deviationPercent: 40,
      useGrid: true,
      grids: [
        { minPrice: 0, maxPrice: 1000, deviationPercent: 50 }
      ],
      servers: 'ALL',
      serverConfigs: {
        5: { deviationPercent: 99, useGrid: false },
        10: { 
          useGrid: true, 
          grids: [ { minPrice: 0, maxPrice: 1000, deviationPercent: 10 } ] 
        }
      }
    };

    // Server 5 expects exactly 99% deviation fallback, no grids
    expect(service.getRequiredDeviation(settings, 5, 500)).toBe(99);

    // Server 10 uses its own grid
    expect(service.getRequiredDeviation(settings, 10, 500)).toBe(10);
    
    // Server 10 fallback to local deviation if grid miss? Wait, server 10 has no local deviation fallback, it should fallback to global?
    // Let's check logic: if serverConfig but no deviationPercent local fallback, it fall-backs to global grid and then global deviation?
    // Actually, based on implementation, if `getDeviationFromGrid` returns null and no local `deviationPercent` exists, it proceeds to check global settings!
    expect(service.getRequiredDeviation(settings, 10, 5000)).toBe(40); // 40 because global grid doesn't have 5000, global deviation is 40.
  });
});
