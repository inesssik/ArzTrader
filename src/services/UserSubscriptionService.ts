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
    // 1. Ищем ЛЮБУЮ запись подписки (активную или просроченную)
    const existing = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        subscriptionId
      }
    });

    if (existing) {
      // 2. Если подписка просрочена, новое время считаем от "сейчас".
      // Если еще активна, добавляем часы к остатку времени.
      const now = new Date();
      const isExpired = existing.expiresAt < now;
      const baseTime = isExpired ? now.getTime() : existing.expiresAt.getTime();
      const newExpiresAt = new Date(baseTime + hours * 60 * 60 * 1000);

      const currentSettings = (existing.settings as unknown as MarketAlertSettings) || {
        deviationPercent: 40,
        servers: 'ALL',
        allowedServers: 'ALL'
      };

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
      // 4. Создаем новую запись, только если пользователь берет её ВПЕРВЫЕ
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
