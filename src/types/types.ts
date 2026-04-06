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

export interface MarketAlertSettings {
  deviationPercent: number;
  servers: number[] | 'ALL';
}

export interface ProfitableDeal {
  listing: ParsedListing;
  baseAvgPrice: number;
  deviation: number;
}

export interface ParsedListing {
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
  MARKET_ALERTS = 1, // Сповіщення про вигідні товари
  STATISTICS = 2     // Підписка на графіки/статистику (на майбутнє)
}