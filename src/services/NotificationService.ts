import { singleton } from 'tsyringe';
import { BotService } from '../bot/BotService';
import { PrismaService } from '../database/PrismaService';
import { type MarketAlertSettings, type ProfitableDeal, SubscriptionType } from '../types/types';
import { LoggerService } from '../utils/Logger';

@singleton()
export class NotificationService {
  private notifiedDeals = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
    private readonly logger: LoggerService
  ) {}

  public async processAlerts(deals: ProfitableDeal[]) {
    try {
      if (deals.length === 0) return;

      const activeSubscriptions = await this.prisma.userSubscription.findMany({
        where: {
          subscriptionId: SubscriptionType.MARKET_ALERTS,
          expiresAt: { gt: new Date() }
        }
      });

      if (activeSubscriptions.length === 0) return;

      const now = Date.now();

      for (const deal of deals) {
        const { listing, deviation, baseAvgPrice } = deal;

        const dealKey = `${listing.username}_${listing.itemName}_${listing.price}_${listing.serverId}`;

        if (!this.notifiedDeals.has(dealKey)) {
          for (const sub of activeSubscriptions) {
            const settings = (sub.settings as unknown as MarketAlertSettings) || {
              deviationPercent: 20,
              servers: 'ALL'
            };

            const isServerMatch = settings.servers === 'ALL' || settings.servers.includes(listing.serverId);
            const isDeviationMatch = deviation >= settings.deviationPercent;

            if (isServerMatch && isDeviationMatch) {
              const message =
                `📦 <b>${listing.itemName}</b>\n` +
                `💰 Цена: ${listing.serverId === 0 ? (listing.price * 100).toLocaleString() : listing.price.toLocaleString()}$ <i>(${deviation.toFixed(1)}%)</i>\n` +
                `📈 Скуп VC: ${Math.round(baseAvgPrice).toLocaleString()}$\n` +
                `🎁 Кол-во: ${listing.quantity}\n` +
                `🏬 Лавка: ${listing.lavkaUid}\n` +
                `👤 Игрок: ${listing.username}\n` +
                `🖥 Сервер: ${listing.serverId}`;

              this.botService
                .sendMessage(sub.userId, message, { parse_mode: 'HTML' })
                .catch(err => this.logger.debug(`Не вдалося відправити юзеру ${sub.userId}: ${err.message}`));
            }
          }
        }

        this.notifiedDeals.set(dealKey, now);
      }
    } catch (error) {
      this.logger.error('[NotificationService] Помилка обробки сповіщень', error);
    }
  }

  public cleanStaleDeals(timeoutMs: number = 10 * 60 * 1000) {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, lastSeen] of this.notifiedDeals.entries()) {
      if (now - lastSeen > timeoutMs) {
        this.notifiedDeals.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.logger.info(`[NotificationService] Очищено ${deletedCount} неактивних угод з пам'яті.`);
    }
  }
}
