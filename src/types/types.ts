export type Lavka = Readonly<{
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
}>;
