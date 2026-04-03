import { singleton } from 'tsyringe';
import { PrismaService } from './PrismaService';
import type { MarketAlertSettings } from './types/types';

@singleton()
export class UserSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  public async getActiveSubscription(userId: string, subscriptionId: number) {
    return this.prisma.userSubscription.findFirst({
      where: {
        userId,
        subscriptionId,
        expiresAt: { gt: new Date() } // Шукаємо тільки активні
      }
    });
  }

  public async updateSettings(subscriptionId: string, settings: MarketAlertSettings) {
    return this.prisma.userSubscription.update({
      where: { id: subscriptionId },
      // Prisma автоматично перетворює об'єкт в JSON
      data: { settings: settings as any }
    });
  }
}