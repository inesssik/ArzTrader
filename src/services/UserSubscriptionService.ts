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
}