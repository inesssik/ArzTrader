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
      '👋 *Добро пожаловать в ArzTrader Bot!*\n\nЗдесь вы можете управлять своими подписками и получать уведомления о самых выгодных сделках на рынке.';

    // Используем InlineKeyboard
    const keyboard = new InlineKeyboard()
      .text('🛒 Мои подписки', 'menu_subs')
      .row()
      .text('👨‍💻 Поддержка', 'menu_support');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    }
  }

  private async handleSupport(ctx: Context) {
    const text = "👨‍💻 Связь с поддержкой и разработчиком: @floypi";
    const keyboard = new InlineKeyboard().text('🔙 Главное меню', 'menu_main');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleSubs(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);

    let text = '🛒 *Ваши подписки*\n\n';
    const keyboard = new InlineKeyboard();

    if (activeSub) {
      text += `✅ *Market Alerts*\n⏳ Активна до: _${activeSub.expiresAt.toLocaleDateString('ru-RU')}_`;
      keyboard.text('⚙️ Настройки уведомлений', 'menu_settings').row();
    } else {
      text += `❌ У вас нет активных подписок.`;
      keyboard.text('💳 Купить подписку', 'menu_buy').row();
    }

    keyboard.text('🔙 Главное меню', 'menu_main');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleBuy(ctx: Context) {
    const text = '💳 *Покупка подписки*\n\nДля оформления подписки обратитесь к администратору:\n👉 @floypi';
    const keyboard = new InlineKeyboard().text('🔙 Назад к подпискам', 'menu_subs');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleSettings(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);

    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!', show_alert: true });
      return;
    }

    const text = `⚙️ *Настройки Market Alerts*\n\nВыберите параметр, который хотите настроить:`;

    const keyboard = new InlineKeyboard()
      .text('📊 Процент выгоды', 'menu_settings_deviation')
      .row()
      .text('🌐 Серверы', 'menu_settings_servers')
      .row()
      .text('🔙 Назад к подпискам', 'menu_subs');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  }

  private async handleDeviationSettings(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);

    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!', show_alert: true });
      return;
    }

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };
    const text = `📊 *Настройка Deviation Percent*\n\nТекущий уровень: ${settings.deviationPercent}%\n_Бот будет отправлять уведомления, если цена дешевле средней на ${settings.deviationPercent}%._`;

    const keyboard = new InlineKeyboard()
      .text('➖ (-5%)', 'settings_dev_minus')
      .text('➕ (+5%)', 'settings_dev_plus')
      .row()
      .text('🔙 Назад к настройкам', 'menu_settings');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    }
  }

  private async handleDeviationChange(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const action = ctx.match![1]; // 'plus' или 'minus'

    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!' });
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
      await ctx.answerCallbackQuery({ text: `✅ Изменено на ${newDeviation}%` });

      // Обновляем UI (перерисовываем сообщение)
      await this.handleDeviationSettings(ctx);
    } else {
      await ctx.answerCallbackQuery({ text: '⚠️ Достигнут лимит!' });
    }
  }

  private async handleServersSettings(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);

    if (!activeSub) {
      await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!', show_alert: true });
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
        .text(allSelected ? '❌ Выключить все' : '✅ Включить все', `settings_servers_toggle_all_${currentPage}`)
        .row();
    }

    keyboard.text('🔙 Назад к настройкам', 'menu_settings');

    let text = '';
    if (availableServerIds.length === 1) {
      text = `🌐 *Настройка серверов*\n\nВам доступен только сервер: *${serversArr[availableServerIds[0]!]}*.`;
    } else if (allowedServers === 'ALL') {
      text = '🌐 *Настройка серверов*\n\nВыберите серверы, с которых вы хотите получать уведомления.';
    } else {
      text = `🌐 *Настройка серверов*\n\nВам предоставлен доступ к ${availableServerIds.length} серверам. Выберите нужные.`;
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
      await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!' });
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
      await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!' });
      return;
    }

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };
    
    const updatedSettings = this.serversService.toggleAllServers(settings);
    await this.userSubscriptionService.updateSettings(activeSub.id, updatedSettings as any);

    ctx.callbackQuery!.data = `settings_servers_page_${currentPage}`;
    await this.handleServersSettings(ctx);
  }
}
