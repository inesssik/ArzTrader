import { singleton } from 'tsyringe';
import { BotService } from './BotService';
import { ConfigService } from './ConfigService';
import { LavkaService } from './LavkaService';
import { LoggerService } from './LoggerService';
import { PrismaService } from './PrismaService';
import { type MarketAlertSettings, SubscriptionType } from './types/types';

@singleton()
export class NotificationService {
  private notifiedDeals = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
    private readonly lavkaService: LavkaService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService
  ) {}

  public async processAlerts() {
    try {
      const activeSubscriptions = await this.prisma.userSubscription.findMany({
        where: {
          subscriptionId: SubscriptionType.MARKET_ALERTS,
          expiresAt: { gt: new Date() } // Підписка ще діє
        }
      });

      if (activeSubscriptions.length === 0) return;

      const deals = await this.lavkaService.getProfitableDeals(this.config.values.MIN_DEVIATION_PERCENT);
      if (deals.length === 0) return;

      const currentDealKeys = new Set<string>();

      for (const deal of deals) {
        const { listing, deviation, avgNormalizedPrice } = deal;
        const dealKey = `${listing.username}_${listing.itemId}_${listing.price}_${listing.serverId}`;
        currentDealKeys.add(dealKey);

        if (!this.notifiedDeals.has(dealKey)) {
          this.notifiedDeals.add(dealKey);

          for (const sub of activeSubscriptions) {
            const settings = (sub.settings as unknown as MarketAlertSettings) || { deviationPercent: 20 };

            if (deviation >= settings.deviationPercent) {
              const message =
                `🚨 **Выгодное предложение!**\n\n` +
                `📦 Товар: ${listing.item.name}\n` +
                `💰 Цена: ${listing.price}$ (Дешевле на ${deviation.toFixed(1)}%)\n` +
                `📊 AVG: ${avgNormalizedPrice}$\n` +
                `👤 Player: ${listing.username}\n` +
                `🖥 Сервер: ${listing.serverId}`;

              this.botService
                .sendMessage(sub.userId, message, { parse_mode: 'Markdown' })
                .catch(err => this.logger.warn(`Не вдалося відправити юзеру ${sub.userId}: ${err.message}`));
            }
          }
        }
      }

      for (const key of this.notifiedDeals) {
        if (!currentDealKeys.has(key)) {
          this.notifiedDeals.delete(key);
        }
      }
    } catch (error) {
      this.logger.error('[NotificationService] Помилка обробки сповіщень', error);
    }
  }
}
