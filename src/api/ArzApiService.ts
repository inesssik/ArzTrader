import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { singleton } from 'tsyringe';
import { ConfigService } from '../config/ConfigService';
import { PrismaService } from '../database/PrismaService';
import type { Lavka } from '../types/types';
import { LoggerService } from '../utils/Logger';

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
      baseURL: 'https://reserve-api.arz.market/api',
      httpAgent: new http.Agent({ timeout: 10000 }),
      httpsAgent: new https.Agent({ timeout: 10000 }),
      // httpsAgent: new HttpsProxyAgent(this.configService.values.ARZ_API_PROXIES[0]!, { timeout: 10000 }),
      timeout: 10000
    });

    // this.initInterceptors();
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
          (error.response?.status === 401 || error.response?.status === 403) &&
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

  public async getOnlines(serverId: number) {
    const res = await this.axiosInstance.get<Lavka[]>(`/getSelectedMarketplace/${serverId}`, {
      signal: AbortSignal.timeout(15000)
    });
    return res.data;
  }
}
