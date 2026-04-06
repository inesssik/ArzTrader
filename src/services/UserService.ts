import { singleton } from 'tsyringe';
import { PrismaService } from '../database/PrismaService';

@singleton()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  public async ensureUserExists(userId: string, username?: string) {
    return this.prisma.user.upsert({
      where: { id: userId },
      update: { username: username || null },
      create: { id: userId, username: username || null },
    });
  }
}