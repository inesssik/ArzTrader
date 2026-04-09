import { singleton } from 'tsyringe';
import { PrismaService } from '../database/PrismaService';
import type { MarketAlertSettings } from '../types/types';

@singleton()
export class UserSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  public async getActiveSubscription(userId: string, subscriptionId: number) {
    return this.prisma.userSubscription.findFirst({
      where: {
        userId,
        subscriptionId,
        expiresAt: { gt: new Date() }
      }
    });
  }

  public async updateSettings(subscriptionId: string, settings: MarketAlertSettings) {
    return this.prisma.userSubscription.update({
      where: { id: subscriptionId },
      data: { settings: settings as any }
    });
  }

  public async addOrUpdateSubscription(
    userId: string,
    subscriptionId: number,
    hours: number,
    servers: number[] | 'ALL'
  ) {
    const existing = await this.getActiveSubscription(userId, subscriptionId);

    if (existing) {
      const newExpiresAt = new Date(existing.expiresAt.getTime() + hours * 60 * 60 * 1000);
      
      const currentSettings = (existing.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL', allowedServers: 'ALL' };
      
      let finalAllowedServers: number[] | 'ALL' = 'ALL';
      
      if (servers === 'ALL' || currentSettings.allowedServers === 'ALL') {
        finalAllowedServers = 'ALL';
      } else {
        const currentServers = currentSettings.allowedServers || [];
        finalAllowedServers = Array.from(new Set([...currentServers, ...(Array.isArray(servers) ? servers : [])]));
      }

      let finalSelectedServers: number[] | 'ALL' = currentSettings.servers;
      if (finalSelectedServers !== 'ALL') {
        if (servers === 'ALL') {
           finalSelectedServers = 'ALL';
        } else {
           finalSelectedServers = Array.from(new Set([...finalSelectedServers, ...servers]));
        }
      }

      return this.prisma.userSubscription.update({
        where: { id: existing.id },
        data: {
          expiresAt: newExpiresAt,
          settings: {
            ...currentSettings,
            allowedServers: finalAllowedServers,
            servers: finalSelectedServers
          } as any
        }
      });
    } else {
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      
      return this.prisma.userSubscription.create({
        data: {
          userId,
          subscriptionId,
          expiresAt,
          settings: {
            deviationPercent: 40,
            servers: servers, 
            allowedServers: servers
          } as any
        }
      });
    }
  }
}
