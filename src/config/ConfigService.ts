import { singleton } from 'tsyringe';
import z from 'zod';

const arzApiProxyTransformer = (val: string) => {
  const proxies = val.split(',');

  return proxies.map(proxy => {
    const parts = proxy.split(':');

    if (parts.length === 4) {
      const [ip, port, username, password] = parts;
      return `http://${username}:${password}@${ip}:${port}`;
    }

    return proxy;
  });
};

const configSchema = z.object({
  BOT_TOKEN: z.string(),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  ARZ_API_PROXIES: z
    .string()
    .transform(arzApiProxyTransformer)
    .refine(arr => arr.length > 0, 'Nonempty'),
  SESSION_TIMEOUT_MINUTES: z.coerce.number(),
  MIN_DEVIATION_PERCENT: z.coerce.number(),
  VC_PRICE_CURRENCY: z.coerce.number(),
  MIN_MAXBUYPRICE: z.coerce.number(),
  DEAL_TTL_SECONDS: z.coerce.number(),
  ARZ_MARKET_API_TIMEOUT_MS: z.coerce.number()
});

@singleton()
export class ConfigService {
  public readonly values: z.infer<typeof configSchema>;

  constructor() {
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Config validation error: ${parsed.error.message}`);
    }
    this.values = parsed.data;
    console.log(this.values.ARZ_API_PROXIES);
  }
}
