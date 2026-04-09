import { type Bot, type Context, InlineKeyboard } from 'grammy';
import { singleton } from 'tsyringe';
import { UserSubscriptionService } from '../../services/UserSubscriptionService';
import { ServersService } from '../../services/ServersService';
import { type MarketAlertSettings, SubscriptionType } from '../../types/types';
import { serversArr } from '../../config/servers';

@singleton()
export class MenuController {
  constructor(
    private readonly userSubscriptionService: UserSubscriptionService,
    private readonly serversService: ServersService
  ) {}

  public register(bot: Bot) {
    bot.command('start', this.handleStart.bind(this));
    bot.callbackQuery('menu_main', this.handleStart.bind(this));
    bot.callbackQuery('menu_subs', this.handleSubs.bind(this));
    bot.callbackQuery('menu_support', this.handleSupport.bind(this));
    bot.callbackQuery('menu_buy', this.handleBuy.bind(this));
    bot.callbackQuery('menu_settings', this.handleSettings.bind(this));
    bot.callbackQuery('menu_settings_deviation', this.handleDeviationSettings.bind(this));
    bot.callbackQuery(/settings_dev_(plus|minus)/, this.handleDeviationChange.bind(this));

    // Server settings
    bot.callbackQuery('menu_settings_servers', this.handleServersSettings.bind(this));
    bot.callbackQuery(/settings_servers_page_(\d+)/, this.handleServersSettings.bind(this));
    bot.callbackQuery(/settings_server_toggle_(\d+)_(\d+)/, this.handleToggleServer.bind(this));
    bot.callbackQuery(/settings_servers_toggle_all_(\d+)/, this.handleToggleAllServers.bind(this));
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

    const text = `⚙️ *Налаштування Market Alerts*\n\nОберіть параметр, який хочете налаштувати:`;

    const keyboard = new InlineKeyboard()
      .text('📊 Відсоток вигоди', 'menu_settings_deviation')
      .row()
      .text('🌐 Сервери', 'menu_settings_servers')
      .row()
      .text('🔙 Назад до підписок', 'menu_subs');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleDeviationSettings(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);

    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Підписка не активна!', show_alert: true });
      return;
    }

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };
    const text = `📊 *Налаштування Deviation Percent*\n\nПоточний рівень: ${settings.deviationPercent}%\n_Бот надсилатиме сповіщення, якщо ціна дешевша за середню на ${settings.deviationPercent}%._`;

    const keyboard = new InlineKeyboard()
      .text('➖ (-5%)', 'settings_dev_minus')
      .text('➕ (+5%)', 'settings_dev_plus')
      .row()
      .text('🔙 Назад до налаштувань', 'menu_settings');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    }
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
    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 20, servers: 'ALL' };
    let newDeviation = Math.min(Math.max(settings.deviationPercent + change, 5), 90);

    if (newDeviation !== settings.deviationPercent) {
      await this.userSubscriptionService.updateSettings(activeSub.id, {
        ...settings,
        deviationPercent: newDeviation
      });
      await ctx.answerCallbackQuery({ text: `✅ Змінено на ${newDeviation}%` });

      // Оновлюємо UI (перемальовуємо повідомлення)
      await this.handleDeviationSettings(ctx);
    } else {
      await ctx.answerCallbackQuery({ text: '⚠️ Досягнуто ліміт!' });
    }
  }

  private async handleServersSettings(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);

    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Підписка не активна!', show_alert: true });
      return;
    }

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };
    const allowedServers = settings.allowedServers ?? 'ALL';
    const availableServerIds = this.serversService.getAvailableServerIds(settings.allowedServers);
    const selectedServers = this.serversService.getSelectedServers(settings);

    const pageMatch = ctx.callbackQuery?.data?.match(/settings_servers_page_(\d+)/);
    const currentPage = pageMatch ? parseInt(pageMatch[1]!, 10) : 0;
    const itemsPerPage = 12;
    const totalPages = Math.ceil(availableServerIds.length / itemsPerPage);

    const keyboard = new InlineKeyboard();

    const startIdx = currentPage * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, availableServerIds.length);

    for (let i = startIdx; i < endIdx; i += 2) {
      const server1Idx = availableServerIds[i]!;
      const isSelected1 = selectedServers.includes(server1Idx);
      const btn1Text = `${isSelected1 ? '✅' : '❌'} ${serversArr[server1Idx]}`;
      keyboard.text(btn1Text, `settings_server_toggle_${server1Idx}_${currentPage}`);

      if (i + 1 < availableServerIds.length) {
        const server2Idx = availableServerIds[i + 1]!;
        const isSelected2 = selectedServers.includes(server2Idx);
        const btn2Text = `${isSelected2 ? '✅' : '❌'} ${serversArr[server2Idx]}`;
        keyboard.text(btn2Text, `settings_server_toggle_${server2Idx}_${currentPage}`);
      }
      keyboard.row();
    }

    if (totalPages > 1) {
      const prevPage = currentPage > 0 ? currentPage - 1 : totalPages - 1;
      const nextPage = currentPage < totalPages - 1 ? currentPage + 1 : 0;

      keyboard.text('⬅️', `settings_servers_page_${prevPage}`);
      keyboard.text(`${currentPage + 1}/${totalPages}`, 'dummy_page');
      keyboard.text('➡️', `settings_servers_page_${nextPage}`);
      keyboard.row();
    }

    if (availableServerIds.length > 1) {
      const allSelected = selectedServers.length === availableServerIds.length;
      keyboard
        .text(allSelected ? '❌ Вимкнути всі' : '✅ Увімкнути всі', `settings_servers_toggle_all_${currentPage}`)
        .row();
    }

    keyboard.text('🔙 Назад до налаштувань', 'menu_settings');

    let text = '';
    if (availableServerIds.length === 1) {
      text = `🌐 *Налаштування серверів*\n\nВам доступний лише сервер: *${serversArr[availableServerIds[0]!]}*.`;
    } else if (allowedServers === 'ALL') {
      text = '🌐 *Налаштування серверів*\n\nОберіть сервери, з яких ви хочете отримувати сповіщення.';
    } else {
      text = `🌐 *Налаштування серверів*\n\nВам надано доступ до ${availableServerIds.length} серверів. Оберіть потрібні.`;
    }

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    }
  }

  private async handleToggleServer(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const match = ctx.callbackQuery?.data?.match(/settings_server_toggle_(\d+)_(\d+)/);
    if (!match) return;
    const serverId = parseInt(match[1]!, 10);
    const currentPage = parseInt(match[2]!, 10);

    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Підписка не активна!' });
      return;
    }

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };

    try {
      const updatedSettings = this.serversService.toggleServer(settings, serverId);
      await this.userSubscriptionService.updateSettings(activeSub.id, updatedSettings as any);
      
      ctx.callbackQuery!.data = `settings_servers_page_${currentPage}`;
      await this.handleServersSettings(ctx);
    } catch (error: any) {
      await ctx.answerCallbackQuery({ text: `⚠️ ${error.message}`, show_alert: true });
    }
  }

  private async handleToggleAllServers(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const match = ctx.callbackQuery?.data?.match(/settings_servers_toggle_all_(\d+)/);
    const currentPage = match ? parseInt(match[1]!, 10) : 0;

    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Підписка не активна!' });
      return;
    }

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };
    
    const updatedSettings = this.serversService.toggleAllServers(settings);
    await this.userSubscriptionService.updateSettings(activeSub.id, updatedSettings as any);

    ctx.callbackQuery!.data = `settings_servers_page_${currentPage}`;
    await this.handleServersSettings(ctx);
  }
}
