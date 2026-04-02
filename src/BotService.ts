import { Bot } from 'grammy';
import { singleton } from 'tsyringe';
import { ConfigService } from './ConfigService';
import { LoggerService } from './LoggerService';
import { PrismaService } from './PrismaService';

@singleton()
export class BotService {
  private readonly tgBot: Bot;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly prismaService: PrismaService
  ) {
    this.tgBot = new Bot(this.configService.values.BOT_TOKEN);
  }

  private async registerHandlers() {
    // await this.prismaService.user.create({
    //   data: {
    //     id: '1',
    //     name: 'Alice'
    //   }
    // });
    const user = await this.prismaService.telegramUser.findFirst({where: { id: '1' }});
    this.tgBot.hears('/start', ctx => ctx.reply(JSON.stringify(user)));
  }

  public async init() {
    await this.registerHandlers();

    this.tgBot.start({
      onStart: () => this.loggerService.info(`Bot has been started`)
    });
  }
}
