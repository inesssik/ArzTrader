import { type Bot, type Context, type NextFunction, InlineKeyboard } from 'grammy';
import { singleton } from 'tsyringe';
import { UserSubscriptionService } from '../../services/UserSubscriptionService';
import { ServersService } from '../../services/ServersService';
import { RedisService } from '../../database/RedisService';
import { type MarketAlertSettings, SubscriptionType, type ProfitGridRule, type ServerConfig } from '../../types/types';
import { serversArr } from '../../config/servers';
import { ConfigService } from '../../config/ConfigService';

@singleton()
export class MenuController {
  constructor(
    private readonly userSubscriptionService: UserSubscriptionService,
    private readonly serversService: ServersService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService
  ) {}

  public register(bot: Bot) {
    bot.command('start', this.handleStart.bind(this));

    bot.on('message:text', this.handleTextMessage.bind(this));

    bot.callbackQuery('menu_main', this.handleStart.bind(this));
    bot.callbackQuery('menu_subs', this.handleSubs.bind(this));
    bot.callbackQuery('menu_support', this.handleSupport.bind(this));
    bot.callbackQuery('menu_buy', this.handleBuy.bind(this));
    bot.callbackQuery('menu_settings', this.handleSettings.bind(this));

    bot.callbackQuery('menu_settings_deviation', this.handleDeviationMenu.bind(this));
    bot.callbackQuery('menu_dev_global', this.handleDevGlobal.bind(this));
    bot.callbackQuery(/settings_dev_(plus|minus)/, this.handleDeviationChange.bind(this));
    bot.callbackQuery('dev_global_toggle_grid', this.handleGlobalToggleGrid.bind(this));
    bot.callbackQuery('dev_global_edit_grid', this.handleGlobalEditGrid.bind(this));

    bot.callbackQuery('menu_dev_servers_list', this.handleDevServersList.bind(this));
    bot.callbackQuery(/dev_servers_page_(\d+)/, this.handleDevServersList.bind(this));
    bot.callbackQuery(/menu_dev_server_(\d+)/, this.handleDevServerSettings.bind(this));
    bot.callbackQuery(/dev_srv_(\d+)_(plus|minus)/, this.handleDevServerChange.bind(this));
    bot.callbackQuery(/dev_srv_toggle_grid_(\d+)/, this.handleDevServerToggleGrid.bind(this));
    bot.callbackQuery(/dev_srv_edit_grid_(\d+)/, this.handleDevServerEditGrid.bind(this));

    bot.callbackQuery('dev_apply_all', this.handleDevApplyAll.bind(this));
    bot.callbackQuery('dev_apply_all_except_vc', this.handleDevApplyAllExceptVC.bind(this));

    bot.callbackQuery('menu_settings_servers', this.handleServersSettings.bind(this));
    bot.callbackQuery(/settings_servers_page_(\d+)/, this.handleServersSettings.bind(this));
    bot.callbackQuery(/settings_server_toggle_(\d+)_(\d+)/, this.handleToggleServer.bind(this));
    bot.callbackQuery(/settings_servers_toggle_all_(\d+)/, this.handleToggleAllServers.bind(this));
  }

  private parsePrice(str: string): number {
    let lower = str.toLowerCase().trim();
    let multiplier = 1;
    if (lower.endsWith('ккк')) {
      multiplier = 1_000_000_000;
      lower = lower.replace('ккк', '');
    } else if (lower.endsWith('kkk')) {
      multiplier = 1_000_000_000;
      lower = lower.replace('kkk', '');
    } else if (lower.endsWith('кк')) {
      multiplier = 1_000_000;
      lower = lower.replace('кк', '');
    } else if (lower.endsWith('kk')) {
      multiplier = 1_000_000;
      lower = lower.replace('kk', '');
    } else if (lower.endsWith('к')) {
      multiplier = 1_000;
      lower = lower.replace('к', '');
    } else if (lower.endsWith('k')) {
      multiplier = 1_000;
      lower = lower.replace('k', '');
    }

    // Support "+"
    if (lower.endsWith('+')) lower = lower.replace('+', '');

    const num = parseFloat(lower);
    if (isNaN(num)) return 0;
    return num * multiplier;
  }

  private parseGridText(text: string): ProfitGridRule[] {
    const rules: ProfitGridRule[] = [];
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(':');
      if (parts.length !== 2) throw new Error(`Неверный формат строки: ${line}`);

      const priceRange = parts[0]!.trim();
      const percentStr = parts[1]!.replace('%', '').trim();
      const deviationPercent = parseFloat(percentStr);
      if (isNaN(deviationPercent)) throw new Error(`Неверный процент: ${percentStr}`);

      if (priceRange.endsWith('+')) {
        const minStr = priceRange.replace('+', '');
        rules.push({ minPrice: this.parsePrice(minStr), maxPrice: Number.MAX_SAFE_INTEGER, deviationPercent });
      } else {
        const rangeParts = priceRange.split('-');
        if (rangeParts.length !== 2) throw new Error(`Неверный диапазон цен: ${priceRange}`);
        rules.push({
          minPrice: this.parsePrice(rangeParts[0]!),
          maxPrice: this.parsePrice(rangeParts[1]!),
          deviationPercent
        });
      }
    }
    return rules.sort((a, b) => a.minPrice - b.minPrice);
  }

  private async handleTextMessage(ctx: Context, next: NextFunction) {
    if (!ctx.from || !ctx.message?.text) return next();
    const userId = ctx.from.id.toString();
    const state = await this.redisService.get<{ action: string; serverId?: number }>(`user_state:${userId}`);

    if (!state) return next();

    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) {
      await this.redisService.del(`user_state:${userId}`);
      return next();
    }

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };

    try {
      if (state.action === 'WAIT_GLOBAL_GRID') {
        const grids = this.parseGridText(ctx.message.text);
        await this.userSubscriptionService.updateSettings(activeSub.id, { ...settings, grids, useGrid: true });
        await ctx.reply('✅ Глобальная сетка профитов успешно сохранена и включена!');
      } else if (state.action === 'WAIT_SERVER_GRID') {
        const serverId = state.serverId!;
        const grids = this.parseGridText(ctx.message.text);

        const serverConfigs = settings.serverConfigs || {};
        serverConfigs[serverId] = { ...(serverConfigs[serverId] || {}), grids, useGrid: true };

        await this.userSubscriptionService.updateSettings(activeSub.id, { ...settings, serverConfigs });
        await ctx.reply(`✅ Сетка профитов для сервера **${serversArr[serverId]}** успешно сохранена!`, {
          parse_mode: 'Markdown'
        });
      }
      await this.redisService.del(`user_state:${userId}`);

      // Вернуть в меню
      await this.handleDeviationMenu(ctx);
    } catch (e: any) {
      await ctx.reply(`❌ Ошибка сохранения сетки: ${e.message}\nПопробуйте еще раз или нажмите /start для отмены.`);
    }
  }

  // ============== DEFAULT MENU ==============
  private async handleStart(ctx: Context) {
    await this.redisService.del(`user_state:${ctx.from!.id}`);
    const text =
      '👋 *Добро пожаловать в ArzTrader Bot!*\n\nЗдесь вы можете управлять своими подписками и получать уведомления о самых выгодных сделках на рынке.';
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
    await ctx.editMessageText('👨‍💻 Связь с поддержкой и разработчиком: @floypi', {
      reply_markup: new InlineKeyboard().text('🔙 Главное меню', 'menu_main'),
      parse_mode: 'Markdown'
    });
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
  }

  private async handleBuy(ctx: Context) {
    await ctx.editMessageText(
      '💳 *Покупка подписки*\n\nДля оформления подписки обратитесь к администратору:\n👉 @floypi',
      { reply_markup: new InlineKeyboard().text('🔙 Назад', 'menu_subs'), parse_mode: 'Markdown' }
    );
  }

  private async handleSettings(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!', show_alert: true });

    const keyboard = new InlineKeyboard()
      .text('📊 Процент выгоды (Сетки)', 'menu_settings_deviation')
      .row()
      .text('🌐 Серверы', 'menu_settings_servers')
      .row()
      .text('🔙 Назад к подпискам', 'menu_subs');

    await ctx.editMessageText(`⚙️ *Настройки Market Alerts*\n\nВыберите параметр, который хотите настроить:`, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });
  }

  // ============== DEVIATION SETTINGS MENU ==============
  private async handleDeviationMenu(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const keyboard = new InlineKeyboard()
      .text('🌍 Глобальные настройки выгоды', 'menu_dev_global')
      .row()
      .text('🖥 Индивидуально по серверам', 'menu_dev_servers_list')
      .row()
      .text('🔙 Назад', 'menu_settings');

    const text = `📊 *Настройка процента выгоды*\n\nЗдесь вы можете настроить "Единый процент" или "Сетку процентов" (разный процент для разных цен).\nМожно привязать сетки как глобально, так и индивидуально для серверов.`;
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    } else {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
    }
  }

  private renderGridText(grids?: ProfitGridRule[]): string {
    if (!grids || grids.length === 0) return 'Сетка не настроена';
    return grids
      .map(g => {
        const maxStr = g.maxPrice === Number.MAX_SAFE_INTEGER ? '∞' : `${(g.maxPrice / 1000000).toFixed(1)}кк`;
        return `${(g.minPrice / 1000000).toFixed(1)}кк - ${maxStr}:  ${g.deviationPercent}%`;
      })
      .join('\n');
  }

  private async handleDevGlobal(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;
    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };

    let text = `🌍 *Глобальная настройка выгоды*\n\n`;
    const keyboard = new InlineKeyboard();

    if (settings.useGrid) {
      text += `Режим: 🟩 *СЕТКА ПРОЦЕНТОВ*\n\nТекущая сетка:\n\`\`\`text\n${this.renderGridText(settings.grids)}\n\`\`\``;
      keyboard.text('🔄 Переключить на ЕДИНЫЙ ПРОЦЕНТ', 'dev_global_toggle_grid').row();
      keyboard.text('📝 Редактировать СЕТКУ', 'dev_global_edit_grid').row();
    } else {
      text += `Режим: 🟩 *ЕДИНЫЙ ПРОЦЕНТ*\nСделки будут приходить если выгода больше: *${settings.deviationPercent}%*\n`;
      keyboard.text('➖ (-5%)', 'settings_dev_minus').text('➕ (+5%)', 'settings_dev_plus').row();
      keyboard.text('🔄 Переключить на СЕТКУ ПРОЦЕНТОВ', 'dev_global_toggle_grid').row();
    }

    keyboard.text('🚀 Применить ко всем серверам', 'dev_apply_all').row();
    keyboard.text('🚀 Применить ко всем кроме VC', 'dev_apply_all_except_vc').row();
    keyboard.text('🔙 Назад', 'menu_settings_deviation');

    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
  }

  private async handleDeviationChange(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const action = ctx.match![1];
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const settings = activeSub.settings as unknown as MarketAlertSettings;
    let newDeviation = Math.min(Math.max((settings.deviationPercent || 20) + (action === 'plus' ? 5 : -5), 5), 99);

    await this.userSubscriptionService.updateSettings(activeSub.id, { ...settings, deviationPercent: newDeviation });
    await this.handleDevGlobal(ctx);
  }

  private async handleGlobalToggleGrid(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const settings = activeSub.settings as unknown as MarketAlertSettings;
    await this.userSubscriptionService.updateSettings(activeSub.id, { ...settings, useGrid: !settings.useGrid });
    await this.handleDevGlobal(ctx);
  }

  private async handleGlobalEditGrid(ctx: Context) {
    await this.redisService.set(`user_state:${ctx.from!.id}`, { action: 'WAIT_GLOBAL_GRID' }, 600);
    const text = `📝 *Редактирование глобальной сетки*\n\nОтправьте мне настройки сетки в формате:\n_Мин. цена - Макс. цена : Процент_\n\nПример (к - тысячи, кк - миллионы):\n\`\`\`text\n10кк - 50кк: 20\n50кк - 200кк: 15\n200кк+: 10\n\`\`\``;
    await ctx.editMessageText(text, {
      reply_markup: new InlineKeyboard().text('Отмена', 'menu_dev_global'),
      parse_mode: 'Markdown'
    });
  }

  private async handleDevApplyAll(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const settings = activeSub.settings as unknown as MarketAlertSettings;
    const serverConfigs = settings.serverConfigs || {};

    // Clear all server configs so they fallback to global
    await this.userSubscriptionService.updateSettings(activeSub.id, { ...settings, serverConfigs: {} });
    await ctx.answerCallbackQuery({ text: '✅ Глобальные настройки применены ко всем серверам!', show_alert: true });
  }

  private async handleDevApplyAllExceptVC(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const settings = activeSub.settings as unknown as MarketAlertSettings;
    const serverConfigs = settings.serverConfigs || {};

    const vcConfig = serverConfigs[0]; // Vice-City id=0

    await this.userSubscriptionService.updateSettings(activeSub.id, {
      ...settings,
      serverConfigs: vcConfig ? { 0: vcConfig } : {}
    });
    await ctx.answerCallbackQuery({ text: '✅ Применено ко всем кроме Vice-City!', show_alert: true });
  }

  // ============= PER SERVER DEVIATION =============
  private async handleDevServersList(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const settings = activeSub.settings as unknown as MarketAlertSettings;
    const availableServerIds = this.serversService.getAvailableServerIds(settings.allowedServers);

    const pageMatch = ctx.callbackQuery?.data?.match(/dev_servers_page_(\d+)/);
    const currentPage = pageMatch ? parseInt(pageMatch[1]!, 10) : 0;
    const itemsPerPage = 12;
    const totalPages = Math.ceil(availableServerIds.length / itemsPerPage);

    const keyboard = new InlineKeyboard();
    const startIdx = currentPage * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, availableServerIds.length);

    for (let i = startIdx; i < endIdx; i += 2) {
      const s1 = availableServerIds[i]!;
      const hasPreset1 = settings.serverConfigs?.[s1] !== undefined ? '⚙️' : '';
      keyboard.text(`${hasPreset1} ${serversArr[s1]}`, `menu_dev_server_${s1}`);

      if (i + 1 < availableServerIds.length) {
        const s2 = availableServerIds[i + 1]!;
        const hasPreset2 = settings.serverConfigs?.[s2] !== undefined ? '⚙️' : '';
        keyboard.text(`${hasPreset2} ${serversArr[s2]}`, `menu_dev_server_${s2}`);
      }
      keyboard.row();
    }

    if (totalPages > 1) {
      const prevPage = currentPage > 0 ? currentPage - 1 : totalPages - 1;
      const nextPage = currentPage < totalPages - 1 ? currentPage + 1 : 0;
      keyboard
        .text('⬅️', `dev_servers_page_${prevPage}`)
        .text(`${currentPage + 1}/${totalPages}`, 'dummy_page')
        .text('➡️', `dev_servers_page_${nextPage}`)
        .row();
    }

    keyboard.text('🔙 Назад', 'menu_settings_deviation');
    await ctx.editMessageText(
      `🖥 *Индивидуальные настройки серверов*\n\nВыберите сервер, для которого хотите назначить отдельные проценты или сетку.\nЗначок ⚙️ - сервер имеет индивидуальные настройки.`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  }

  private async handleDevServerSettings(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const serverId = parseInt(ctx.match![1]!, 10);
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const settings = activeSub.settings as unknown as MarketAlertSettings;
    const serverConfig = settings.serverConfigs?.[serverId] || {
      deviationPercent: settings.deviationPercent,
      useGrid: false
    };

    let text = `🖥 *Настройки для: [${serverId}] ${serversArr[serverId]}*\n\n`;
    const keyboard = new InlineKeyboard();

    if (serverConfig.useGrid) {
      text += `Режим: 🟩 *СЕТКА ПРОЦЕНТОВ (Индив.)*\n\nТекущая сетка:\n\`\`\`text\n${this.renderGridText(serverConfig.grids)}\n\`\`\``;
      keyboard.text('🔄 Переключить на ЕДИНЫЙ ПРОЦЕНТ', `dev_srv_toggle_grid_${serverId}`).row();
      keyboard.text('📝 Редактировать СЕТКУ', `dev_srv_edit_grid_${serverId}`).row();
    } else {
      text += `Режим: 🟩 *ЕДИНЫЙ ПРОЦЕНТ (Индив.)*\nВыгода для этого сервера: *${serverConfig.deviationPercent}%*\n`;
      keyboard.text('➖ (-5%)', `dev_srv_${serverId}_minus`).text('➕ (+5%)', `dev_srv_${serverId}_plus`).row();
      keyboard.text('🔄 Переключить на СЕТКУ ПРОЦЕНТОВ', `dev_srv_toggle_grid_${serverId}`).row();
    }

    keyboard.text('🔙 Назад к списку серверов', 'menu_dev_servers_list');
    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
  }

  private async handleDevServerChange(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const serverId = parseInt(ctx.match![1]!, 10);
    const action = ctx.match![2];
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const settings = activeSub.settings as unknown as MarketAlertSettings;
    const serverConfigs = settings.serverConfigs || {};
    const config = serverConfigs[serverId] || { deviationPercent: settings.deviationPercent, useGrid: false };

    let newDeviation = Math.min(Math.max((config.deviationPercent || 20) + (action === 'plus' ? 5 : -5), 5), 99);
    serverConfigs[serverId] = { ...config, deviationPercent: newDeviation };

    await this.userSubscriptionService.updateSettings(activeSub.id, { ...settings, serverConfigs });

    await this.handleDevServerSettings(ctx);
  }

  private async handleDevServerToggleGrid(ctx: Context) {
    const userId = ctx.from!.id.toString();
    const serverId = parseInt(ctx.match![1]!, 10);
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return;

    const settings = activeSub.settings as unknown as MarketAlertSettings;
    const serverConfigs = settings.serverConfigs || {};
    const config = serverConfigs[serverId] || { deviationPercent: settings.deviationPercent, useGrid: false };

    serverConfigs[serverId] = { ...config, useGrid: !config.useGrid };
    await this.userSubscriptionService.updateSettings(activeSub.id, { ...settings, serverConfigs });

    await this.handleDevServerSettings(ctx);
  }

  private async handleDevServerEditGrid(ctx: Context) {
    const serverId = parseInt(ctx.match![1]!, 10);
    await this.redisService.set(`user_state:${ctx.from!.id}`, { action: 'WAIT_SERVER_GRID', serverId }, 600);

    let text = `📝 *Редактирование сетки: ${serversArr[serverId]}*\n\nОтправьте настройки сетки сообщением.`;

    if (serverId === 0) {
      text += `\n\n⚠️ *ВАЖНО*: Сетку для Vice-City необходимо вводить **с ценами SA-валюты (×${this.configService.values.VC_PRICE_CURRENCY})**, а не в VC-долларах. Бот автоматически будет конвертировать цены при поиске!`;
    }

    text += `\n\nПример:\n\`\`\`text\n10кк - 50кк: 20\n50кк - 200кк: 15\n200кк+: 10\n\`\`\``;
    await ctx.editMessageText(text, {
      reply_markup: new InlineKeyboard().text('Отмена', `menu_dev_server_${serverId}`),
      parse_mode: 'Markdown'
    });
  }

  // ============== ACCESS SETTINGS (SERVERS FILTER) ==============
  private async handleServersSettings(ctx: Context) {
    // ... original body for handleServersSettings ...
    const userId = ctx.from!.id.toString();
    const activeSub = await this.userSubscriptionService.getActiveSubscription(userId, SubscriptionType.MARKET_ALERTS);
    if (!activeSub) return await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!', show_alert: true });

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
      keyboard
        .text('⬅️', `settings_servers_page_${prevPage}`)
        .text(`${currentPage + 1}/${totalPages}`, 'dummy_page')
        .text('➡️', `settings_servers_page_${nextPage}`)
        .row();
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
      text = '🌐 *Настройка выдачи*\n\nВыберите серверы, с которых вы хотите получать уведомления.';
    } else {
      text = `🌐 *Настройка выдачи*\n\nВам предоставлен доступ к ${availableServerIds.length} серверам. Выберите нужные.`;
    }

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'Markdown' });
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
    if (!activeSub) return await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!' });

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
    if (!activeSub) return await ctx.answerCallbackQuery({ text: '❌ Подписка не активна!' });

    const settings = (activeSub.settings as unknown as MarketAlertSettings) || { deviationPercent: 40, servers: 'ALL' };
    const updatedSettings = this.serversService.toggleAllServers(settings);
    await this.userSubscriptionService.updateSettings(activeSub.id, updatedSettings as any);

    ctx.callbackQuery!.data = `settings_servers_page_${currentPage}`;
    await this.handleServersSettings(ctx);
  }
}
