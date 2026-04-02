import { singleton } from 'tsyringe';
import z from 'zod';

const arzApiProxyTransformer = (val: string) => {
  const parts = val.split(':');

  if (parts.length === 4) {
    const [ip, port, username, password] = parts;
    return `http://${username}:${password}@${ip}:${port}`;
  }

  return val;
};

const configSchema = z.object({
  BOT_TOKEN: z.string(),
  DATABASE_URL: z.string(),
  ARZ_API_PROXY: z.string().transform(arzApiProxyTransformer),
  SESSION_TIMEOUT_MINUTES: z.coerce.number(),
  MIN_DEVIATION_PERCENT: z.coerce.number()
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
  }
}
