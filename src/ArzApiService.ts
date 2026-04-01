import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { singleton } from 'tsyringe';
import { ConfigService } from './ConfigService';
import { LoggerService } from './LoggerService';
import { PrismaService } from './PrismaService';
import type { Lavka } from './types/types';

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

@singleton()
export class ArzApiService {
  private readonly axiosInstance: AxiosInstance;
  private token: string | null = null;
  private refreshTokenPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly prismaService: PrismaService
  ) {
    this.axiosInstance = axios.create({
      baseURL: 'https://online.arz-mcr.ru/api/lavkas',
      httpsAgent: new HttpsProxyAgent(this.configService.values.ARZ_API_PROXY)
    });

    this.initInterceptors();
  }

  private initInterceptors(): void {
    this.axiosInstance.interceptors.request.use(async config => {
      if (config.url?.includes('/token')) return config;

      if (!this.token) {
        await this.refreshAccessToken();
      }

      config.headers['x-lavka-access-token'] = this.token;
      return config;
    });

    this.axiosInstance.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config as CustomAxiosRequestConfig;

        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/token')
        ) {
          originalRequest._retry = true;

          try {
            await this.refreshAccessToken();

            if (this.token) originalRequest.headers['x-lavka-access-token'] = this.token;

            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessToken(): Promise<void> {
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = (async () => {
      try {
        this.loggerService.info('Obtaining token');
        const res = await this.axiosInstance.get<{ ok: boolean; token: string }>('/token');
        const token = res.data?.token;

        if (!token) throw new Error('Failed to obtain Token');

        this.token = token;
      } finally {
        this.refreshTokenPromise = null;
      }
    })();

    return this.refreshTokenPromise;
  }

  // public async getOnlines() {
  //   const data = (await this.axiosInstance.get<Lavka[]>('/onlines')).data;
  //   await
  // }
}

/*
  1. Беремо 3 перші лота вс*100 (якщо нема 3 перші лота будь якого серверу без *100) 100000, 101000, 102000
  2. Вираховуємо середню ціну 102000
  3. 
*/
