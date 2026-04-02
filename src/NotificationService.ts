import { singleton } from 'tsyringe';
import { PrismaService } from './PrismaService';
import { BotService } from './BotService';
import { LavkaService } from './LavkaService';
import { LoggerService } from './LoggerService';
import { SubscriptionType, type MarketAlertSettings } from './types/types';

@singleton()
export class NotificationService {
  private notifiedDeals = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
    private readonly lavkaService: LavkaService,
    private readonly logger: LoggerService
  ) {}

  public async processAlerts() {
    try {
      // 1. Отримуємо всіх користувачів з АКТИВНОЮ підпискою на сповіщення
      const activeSubscriptions = await this.prisma.userSubscription.findMany({
        where: {
          subscriptionId: SubscriptionType.MARKET_ALERTS,
          expiresAt: { gt: new Date() } // Підписка ще діє
        }
      });

      if (activeSubscriptions.length === 0) return;

      // 2. Отримуємо всі вигідні пропозиції ринку (беремо від 5%, щоб покрити запити всіх юзерів)
      const deals = await this.lavkaService.getProfitableDeals(5);
      if (deals.length === 0) return;

      const currentDealKeys = new Set<string>();

      // 3. Перебираємо знайдені товари
      for (const deal of deals) {
        const { listing, deviation, avgNormalizedPrice } = deal;
        const dealKey = `${listing.username}_${listing.itemId}_${listing.price}_${listing.serverId}`;
        currentDealKeys.add(dealKey);

        // Якщо про цей товар ще не сповіщали в рамках цієї сесії
        if (!this.notifiedDeals.has(dealKey)) {
          this.notifiedDeals.add(dealKey);

          // 4. Шукаємо користувачів, чий відсоток підходить під цю пропозицію
          for (const sub of activeSubscriptions) {
            const settings = (sub.settings as unknown as MarketAlertSettings) || { deviationPercent: 20 };
            
            // Якщо товар вигідніший або дорівнює бажаному відсотку користувача
            if (deviation >= settings.deviationPercent) {
              const message = 
                `🚨 **Выгодное предложение!**\n\n` +
                `📦 Товар: ${listing.item.name}\n` +
                `💰 Цена: ${listing.price}$ (Дешевле на ${deviation.toFixed(1)}%)\n` +
                `📊 AVG: ${avgNormalizedPrice}$\n` +
                `👤 Player: ${listing.username}\n` +
                `🖥 Сервер: ${listing.serverId}`;

              // Відправляємо повідомлення в Telegram (не забуваємо обробляти помилки, щоб блок юзера не поклав бота)
              this.botService.sendMessage(sub.userId, message, { parse_mode: 'Markdown' })
                .catch(err => this.logger.warn(`Не вдалося відправити юзеру ${sub.userId}: ${err.message}`));
            }
          }
        }
      }

      // 5. Очищення кешу від старих товарів, які вже зникли з ринку
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