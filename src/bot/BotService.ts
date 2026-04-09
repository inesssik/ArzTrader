import { Bot } from 'grammy';
import { singleton } from 'tsyringe';
import { ConfigService } from '../config/ConfigService';
import { UserService } from '../services/UserService';
import { LoggerService } from '../utils/Logger';
import { MenuController } from './controllers/MenuController';
import { AdminController } from './controllers/AdminController';

@singleton()
export class BotService {
  private readonly tgBot: Bot;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly userService: UserService,
    private readonly menuController: MenuController, // Інжектимо контролер
    private readonly adminController: AdminController
  ) {
    this.tgBot = new Bot(this.configService.values.BOT_TOKEN);
  }

  public async init() {
    this.tgBot.use(async (ctx, next) => {
      if (ctx.from) {
        await this.userService.ensureUserExists(ctx.from.id.toString(), ctx.from.username);
      }
      return next();
    });

    // Реєструємо роути
    this.menuController.register(this.tgBot);
    this.adminController.register(this.tgBot);

    // Fallback для невідомих команд
    this.tgBot.on('message', async ctx => {
      await ctx.reply('🤔 Я не розумію цю команду. Введіть /start.');
    });

    this.tgBot.catch(err => {
      this.loggerService.error(`Bot Error:`, err);
    });

    this.tgBot.start({
      onStart: () => this.loggerService.info(`Bot has been started`)
    });
  }

  public async sendMessage(chatId: string | number, text: string, options?: any) {
    return this.tgBot.api.sendMessage(chatId, text, options);
  }
}
