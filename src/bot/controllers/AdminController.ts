import { type Bot, type Context } from 'grammy';
import { singleton } from 'tsyringe';
import { UserSubscriptionService } from '../../services/UserSubscriptionService';
import { ConfigService } from '../../config/ConfigService';
import { SubscriptionType } from '../../types/types';
import { serversArr } from '../../config/servers';
import { UserService } from '../../services/UserService';

@singleton()
export class AdminController {
  constructor(
    private readonly userSubscriptionService: UserSubscriptionService,
    private readonly configService: ConfigService,
    private readonly userService: UserService
  ) {}

  public register(bot: Bot) {
    bot.command('give_sub', this.handleGiveSub.bind(this));
  }

  private async handleGiveSub(ctx: Context) {
    const adminIds = this.configService.values.ADMIN_IDS;
    const userIdStr = ctx.from!.id.toString();

    if (!adminIds.includes(userIdStr)) {
      return; 
    }

    const _match = ctx.message?.text?.match(/^\/give_sub\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!_match) {
      await ctx.reply('❌ Формат: /give_sub <user_id> <hours> <servers (через кому або ALL)>');
      return;
    }

    const targetUserId = _match[1]!;
    const hours = parseInt(_match[2]!, 10);
    const serversStr = _match[3]!.trim().toUpperCase();

    try {
      await this.userService.ensureUserExists(targetUserId);
    } catch (err: any) {
      await ctx.reply(`❌ Помилка БД при створенні юзера: ${err.message}`);
      return;
    }

    let servers: number[] | 'ALL' = 'ALL';
    if (serversStr !== 'ALL') {
      try {
        servers = serversStr.split(',').map(s => {
          const id = parseInt(s.trim(), 10);
          if (isNaN(id) || id < 0 || id >= serversArr.length) {
            throw new Error(`Невалідний сервер ID: ${s}`);
          }
          return id;
        });
      } catch (err: any) {
        await ctx.reply(`❌ Помилка парсингу серверів: ${err.message}`);
        return;
      }
    }

    try {
      await this.userSubscriptionService.addOrUpdateSubscription(
        targetUserId,
        SubscriptionType.MARKET_ALERTS,
        hours,
        servers
      );
      
      await ctx.reply(`✅ Підписка оновлена для ${targetUserId} на ${hours} годин. Сервери: ${serversStr}`);
    } catch (err: any) {
      await ctx.reply(`❌ Помилка БД при видачі підписки: ${err.message}\n(Перевірте, чи є тип підписки у таблиці Subscription)`);
    }
  }
}
