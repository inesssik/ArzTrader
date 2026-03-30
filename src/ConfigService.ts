import { singleton } from 'tsyringe';
import z from 'zod';

const configSchema = z.object({
  BOT_TOKEN: z.string(),
  DATABASE_URL: z.string(),
  ARZ_API_PROXY: z.string()
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
