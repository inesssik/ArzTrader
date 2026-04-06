import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { singleton } from 'tsyringe';
import { ConfigService } from '../config/ConfigService';
import { LoggerService } from '../utils/Logger';
import { PrismaService } from '../database/PrismaService';
import type { Lavka } from '../types/types';

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Интерфейс для отдельного клиента в пуле
interface ProxyClient {
  axiosInstance: AxiosInstance;
  token: string | null;
  refreshTokenPromise: Promise<void> | null;
  proxyUrl: string;
}

@singleton()
export class ArzApiService {
  private clients: ProxyClient[] = [];
  private currentClientIndex = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly prismaService: PrismaService
  ) {
    // Предполагается, что теперь вы передаете массив из 10 прокси
    const proxies = this.configService.values.ARZ_API_PROXIES; 
    
    if (!proxies || proxies.length === 0) {
      throw new Error('No proxies provided in ARZ_API_PROXIES');
    }

    for (const proxy of proxies) {
      this.clients.push(this.createProxyClient(proxy));
    }
    
    this.loggerService.info(`Initialized pool with ${this.clients.length} proxies`);
  }

  // Создает изолированного клиента со своими интерцепторами и токеном
  private createProxyClient(proxyUrl: string): ProxyClient {
    const client: ProxyClient = {
      proxyUrl,
      axiosInstance: axios.create({
        baseURL: 'https://online.arz-mcr.ru/api/lavkas',
        httpsAgent: new HttpsProxyAgent(proxyUrl),
        timeout: 30000 // Рекомендую добавить таймаут для парсинга
      }),
      token: null,
      refreshTokenPromise: null
    };

    client.axiosInstance.interceptors.request.use(async config => {
      if (config.url?.includes('/token')) return config;

      if (!client.token) {
        await this.refreshAccessToken(client);
      }

      config.headers['x-lavka-access-token'] = client.token;
      return config;
    });

    client.axiosInstance.interceptors.response.use(
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
            await this.refreshAccessToken(client);
            if (client.token) originalRequest.headers['x-lavka-access-token'] = client.token;
            return client.axiosInstance(originalRequest);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    return client;
  }

  private async refreshAccessToken(client: ProxyClient): Promise<void> {
    if (client.refreshTokenPromise) {
      return client.refreshTokenPromise;
    }

    client.refreshTokenPromise = (async () => {
      try {
        this.loggerService.info(`Obtaining token for proxy: ${client.proxyUrl}`);
        const res = await client.axiosInstance.get<{ ok: boolean; token: string }>('/token');
        const token = res.data?.token;

        if (!token) throw new Error('Failed to obtain Token');

        client.token = token;
      } finally {
        client.refreshTokenPromise = null;
      }
    })();

    return client.refreshTokenPromise;
  }

  // Round-Robin: берет следующий прокси по кругу
  private getNextClient(): ProxyClient {
    const client = this.clients[this.currentClientIndex];
    this.currentClientIndex = (this.currentClientIndex + 1) % this.clients.length;
    return client!;
  }

  // Базовый метод запроса (использует 1 прокси из пула)
  public async getOnlines() {
    const client = this.getNextClient();
    const res = await client.axiosInstance.get<Lavka[]>('/onlines');
    return res.data;
  }

  // --- СИСТЕМА БЫСТРОГО ПАРСИНГА ---

  /**
   * Выполняет параллельные запросы, автоматически распределяя их по прокси.
   * Отлично подходит для ротации в 1 минуту, так как если один IP в момент
   * ротации отвалится, остальные 9 продолжат работу.
   */
  public async fetchMultipleEndpoints<T>(endpoints: string[]): Promise<T[]> {
    const promises = endpoints.map(async (endpoint) => {
      const client = this.getNextClient(); // Берем свободный прокси
      try {
        const res = await client.axiosInstance.get<T>(endpoint);
        return res.data;
      } catch (error) {
        this.loggerService.error(`Error fetching ${endpoint} via ${client.proxyUrl}`, error);
        return null; // Возвращаем null при ошибке, чтобы не рушить Promise.all
      }
    });

    // Ждем выполнения всех запросов
    const results = await Promise.all(promises);
    
    // Фильтруем упавшие запросы (null)
    return results.filter((res) => res !== null) as T[];
  }
}