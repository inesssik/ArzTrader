import { singleton } from 'tsyringe';
import { BotService } from '../bot/BotService';
import { LoggerService } from '../utils/Logger';
import { PrismaService } from '../database/PrismaService';
import { type MarketAlertSettings, SubscriptionType, type ProfitableDeal } from '../types/types';

@singleton()
export class NotificationService {
  private notifiedDeals = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
    private readonly logger: LoggerService
  ) {}

  public async processAlerts(deals: ProfitableDeal[]) {
    try {
      if (deals.length === 0) return;

      // 1. Отримуємо тільки АКТИВНІ підписки на Market Alerts
      const activeSubscriptions = await this.prisma.userSubscription.findMany({
        where: {
          subscriptionId: SubscriptionType.MARKET_ALERTS,
          expiresAt: { gt: new Date() }
        }
      });

      if (activeSubscriptions.length === 0) return;

      const currentDealKeys = new Set<string>();

      // 2. Аналізуємо знайдені угоди та розсилаємо користувачам
      for (const deal of deals) {
        const { listing, deviation, baseAvgPrice } = deal;
        
        // Унікальний ключ угоди (щоб не спамити одним і тим самим товаром кожні 10 хвилин)
        const dealKey = `${listing.username}_${listing.itemName}_${listing.price}_${listing.serverId}`;
        currentDealKeys.add(dealKey);

        if (!this.notifiedDeals.has(dealKey)) {
          this.notifiedDeals.add(dealKey);

          for (const sub of activeSubscriptions) {
            const settings = (sub.settings as unknown as MarketAlertSettings) || { deviationPercent: 20, servers: 'ALL' };

            // Перевіряємо, чи підходить сервер
            const isServerMatch = settings.servers === 'ALL' || settings.servers.includes(listing.serverId);
            
            // Перевіряємо, чи підходить відсоток знижки
            const isDeviationMatch = deviation >= settings.deviationPercent;

            if (isServerMatch && isDeviationMatch) {
              const message =
                `📦 <b>${listing.itemName}</b>\n` +
                `💰 Цена: ${listing.price.toLocaleString()}$ <i>(${deviation.toFixed(1)}%)</i>\n` +
                `📈 Скупка: ${Math.round(baseAvgPrice).toLocaleString()}$\n` +
                `🎁 Кол-во: ${listing.quantity}\n` +
                `🏬 Лавка: ${listing.lavkaUid}\n` +
                `👤 Игрок: ${listing.username}\n` +
                `🖥 Сервер: ${listing.serverId}`;

              // Відправляємо асинхронно, щоб не блокувати цикл
              this.botService
                .sendMessage(sub.userId, message, { parse_mode: "HTML" })
                .catch(err => this.logger.debug(`Не вдалося відправити юзеру ${sub.userId}: ${err.message}`));
            }
          }
        }
      }

      // 3. Очищення кешу пам'яті (видаляємо угоди, яких вже немає на ринку)
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