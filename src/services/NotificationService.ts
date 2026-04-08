import { singleton } from 'tsyringe';
import { BotService } from '../bot/BotService';
import { PrismaService } from '../database/PrismaService';
import { RedisService } from '../database/RedisService';
import { type MarketAlertSettings, type ProfitableDeal, SubscriptionType } from '../types/types';
import { LoggerService } from '../utils/Logger';

@singleton()
export class NotificationService {
  private readonly DEAL_TTL_SECONDS = 10 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
    private readonly logger: LoggerService,
    private readonly redisService: RedisService
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

      for (const deal of deals) {
        const { listing, deviation, baseAvgPrice } = deal;
        const dealKey = `deal:${listing.username}_${listing.itemName}_${listing.price}_${listing.serverId}`;
        const isNewDeal = await this.redisService.setIfNotExists(dealKey, this.DEAL_TTL_SECONDS);

        if (isNewDeal) {
          for (const sub of activeSubscriptions) {
            const settings = (sub.settings as unknown as MarketAlertSettings) || {
              deviationPercent: 20,
              servers: 'ALL'
            };

            const isServerMatch = settings.servers === 'ALL' || settings.servers.includes(listing.serverId);
            const isDeviationMatch = deviation >= settings.deviationPercent;

            if (isServerMatch && isDeviationMatch) {
              const baseAvgPriceParsed = Math.round(listing.serverId === 0 ? baseAvgPrice / 100 : baseAvgPrice);

              const message =
                `📦 <b>${listing.itemName}</b>\n` +
                `💰 Цена: ${listing.price.toLocaleString()}$ <i>(${deviation.toFixed(1)}%)</i>\n` +
                `📈 Скуп VC: ${baseAvgPriceParsed.toLocaleString()}$\n` +
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
      }
    } catch (error) {
      this.logger.error('[NotificationService] Помилка обробки сповіщень', error);
    }
  }
}
