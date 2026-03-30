import axios, { type AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { singleton } from 'tsyringe';
import { ConfigService } from './ConfigService';
import { PrismaService } from './PrismaService';

@singleton()
export class ArzApiService {
  private readonly axiosInstance: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService
  ) {
    this.axiosInstance = axios.create({
      baseURL: 'https://online.arz-mcr.ru/api/lavkas',
      httpsAgent: new HttpsProxyAgent(this.configService.values.ARZ_API_PROXY)
    });
  }

  public async getOnlines() {
    console.log((await this.axiosInstance.get('/onlines')).data);
  }
}
