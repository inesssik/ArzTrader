import { singleton } from 'tsyringe';
import { BotService } from '../bot/BotService';
import { PrismaService } from '../database/PrismaService';
import { RedisService } from '../database/RedisService';
import { type MarketAlertSettings, type ProfitableDeal, SubscriptionType } from '../types/types';
import { LoggerService } from '../utils/Logger';
import { ConfigService } from '../config/ConfigService';
import { getServerName } from '../config/servers';
import { ServersService } from './ServersService';

@singleton()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly serversService: ServersService
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
        const dealKey = `deal:${listing.username}_${listing.itemId}_${listing.price}_${listing.serverId}`;
        const isNewDeal = await this.redis.setIfNotExists(dealKey, this.config.values.DEAL_TTL_SECONDS);

        if (isNewDeal) {
          for (const sub of activeSubscriptions) {
            const settings = (sub.settings as unknown as MarketAlertSettings) || {
              deviationPercent: 40,
              servers: 'ALL'
            };

            const isServerMatch = this.serversService.isServerMatch(settings, listing.serverId);

            const isDeviationMatch = deviation >= settings.deviationPercent;

            if (isServerMatch && isDeviationMatch) {
              const baseAvgPriceParsed = Math.round(
                listing.serverId === 0 ? baseAvgPrice / this.config.values.VC_PRICE_CURRENCY : baseAvgPrice
              );

              let profitTag = '';
              if (deviation >= 50) profitTag = 'ЛУЧШАЯ ЦЕНА 🔥\n';
              else profitTag = 'Выгодный товар ✅\n';

              const message =
                `<b>${profitTag}</b>` +
                `📦 <b>${listing.itemName}</b>\n` +
                `💰 Цена: ${listing.price.toLocaleString()}$ <i>(${deviation.toFixed(1)}%)</i>\n` +
                `📈 Скуп VC: ${baseAvgPriceParsed.toLocaleString()}$\n` +
                `🎁 Кол-во: ${listing.quantity}\n` +
                `🏬 Лавка: ${listing.lavkaUid}\n` +
                `👤 Игрок: ${listing.username}\n` +
                `🖥 Сервер: [${listing.serverId}] ${getServerName(listing.serverId)}`;

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
