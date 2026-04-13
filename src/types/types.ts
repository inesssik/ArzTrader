export type Lavka = {
  username: string;
  items_sell: string[];
  items_buy: string[];
  price_sell: number[];
  price_buy: number[];
  count_sell: number[];
  count_buy: number[];
  ostime: number;
  LavkaUid: number;
  serverId: number;
  userStatus: number;
};

export enum ListingTypes {
  SELL = 'SELL',
  BUY = 'BUY'
}

export interface ProfitGridRule {
  minPrice: number;
  maxPrice: number;
  deviationPercent: number;
}

export interface ServerConfig {
  deviationPercent?: number;
  grids?: ProfitGridRule[];
  useGrid?: boolean;
}

export interface MarketAlertSettings {
  deviationPercent: number;
  grids?: ProfitGridRule[];
  useGrid?: boolean;
  servers: number[] | 'ALL';
  allowedServers?: number[] | 'ALL'; // Новое поле для ограничения определенных серверов
  serverConfigs?: Record<number, ServerConfig>;
  maxProfit?: number
}

export interface ProfitableDeal {
  listing: ParsedListing;
  baseAvgPrice: number;
  deviation: number;
  profit: number;
}

export interface ParsedListing {
  itemId: string;
  itemName: string;
  type: ListingTypes;
  price: number;
  quantity: number;
  username: string;
  timestamp: Date;
  lavkaUid: number;
  serverId: number;
}

export enum SubscriptionType {
  MARKET_ALERTS = 1, // Уведомления о выгодных товарах
  STATISTICS = 2 // Подписка на графики/статистику (на будущее)
}
