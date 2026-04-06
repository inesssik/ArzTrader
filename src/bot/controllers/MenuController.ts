import { type Bot, type Context, InlineKeyboard } from 'grammy';
import { singleton } from 'tsyringe';
import { UserSubscriptionService } from '../../services/UserSubscriptionService';
import { type MarketAlertSettings, SubscriptionType } from '../../types/types';

@singleton()
export class MenuController {
  constructor(private readonly userSubscriptionService: UserSubscriptionService) {}

  public register(bot: Bot) {
    bot.command('start', this.handleStart.bind(this));
    bot.callbackQuery('menu_main', this.handleStart.bind(this));
    bot.callbackQuery('menu_subs', this.handleSubs.bind(this));
    bot.callbackQuery('menu_support', this.handleSupport.bind(this));
    bot.callbackQuery('menu_buy', this.handleBuy.bind(this));
    bot.callbackQuery('menu_settings', this.handleSettings.bind(this));
    bot.callbackQuery(/settings_dev_(plus|minus)/, this.handleDeviationChange.bind(this));
  }

  private async handleStart(ctx: Context) {
    const text =
      '👋 *Вітаємо у ArzTrader Bot!*\n\nТут ви можете керувати своїми підписками та отримувати сповіщення про найвигідніші угоди на ринку.';

    // Використовуємо InlineKeyboard
    const keyboard = new InlineKeyboard()
      .text('🛒 Мої підписки', 'menu_subs')
      .row()
      .text('👨‍💻 Підтримка', 'menu_support');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    }
  }

  private async handleSupport(ctx: Context) {
    const text = "👨‍💻 Зв'язок з підтримкою та розробником: @floypi";
    const keyboard = new InlineKeyboard().text('🔙 Головне меню', 'menu_main');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleSubs(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);

    let text = '🛒 *Ваші підписки*\n\n';
    const keyboard = new InlineKeyboard();

    if (activeSub) {
      text += `✅ *Market Alerts*\n⏳ Активна до: _${activeSub.expiresAt.toLocaleDateString('uk-UA')}_`;
      keyboard.text('⚙️ Налаштування сповіщень', 'menu_settings').row();
    } else {
      text += `❌ У вас немає активних підписок.`;
      keyboard.text('💳 Купити підписку', 'menu_buy').row();
    }

    keyboard.text('🔙 Головне меню', 'menu_main');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleBuy(ctx: Context) {
    const text = '💳 *Купівля підписки*\n\nДля оформлення підписки зверніться до адміністратора:\n👉 @floypi';
    const keyboard = new InlineKeyboard().text('🔙 Назад до підписок', 'menu_subs');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleSettings(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);

    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Підписка не активна!', show_alert: true });
      return;
    }

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40 };
    const text = `⚙️ *Налаштування Market Alerts*\n\n📊 *Deviation Percent:* ${settings.deviationPercent}%\n_Бот надсилатиме сповіщення, якщо ціна дешевша за середню на ${settings.deviationPercent}%._`;

    const keyboard = new InlineKeyboard()
      .text('➖ (-5%)', 'settings_dev_minus')
      .text('➕ (+5%)', 'settings_dev_plus')
      .row()
      .text('🔙 Назад до підписок', 'menu_subs');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleDeviationChange(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const action = ctx.match![1]; // 'plus' або 'minus'

    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Підписка не активна!' });
      return;
    }

    const change = action === 'plus' ? 5 : -5;
    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 20 };
    let newDeviation = Math.min(Math.max(settings.deviationPercent + change, 5), 90);

    if (newDeviation !== settings.deviationPercent) {
      await this.userSubscriptionService.updateSettings(activeSub.id, {
        deviationPercent: newDeviation,
        servers: 'ALL'
      });
      await ctx.answerCallbackQuery({ text: `✅ Змінено на ${newDeviation}%` });

      // Оновлюємо UI (перемальовуємо повідомлення)
      await this.handleSettings(ctx);
    } else {
      await ctx.answerCallbackQuery({ text: '⚠️ Досягнуто ліміт!' });
    }
  }
}
