import { PrismaPg } from '@prisma/adapter-pg';
import { env } from 'prisma/config';
import { SubscriptionType } from '../src/types/types';
import { Prisma, PrismaClient } from './generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env('DATABASE_URL')
  })
});

async function main() {
  console.log('🌱 Начинаем наполнение базы данных (Seeding)...');
  await fillSubTypes();
  await fillUsers();
  await fillSubsForOwners();
  console.log('🌱 Seed ended');
}

async function fillUsers() {
  await prisma.user.createMany({
    data: [{ id: '633180859' }, { id: '961646710' }, { id: '8335094347' }],
    skipDuplicates: true
  });
}

async function fillSubsForOwners() {
  const defaultForUser = {
    expiresAt: new Date('2036-01-01 12:00:00.000'),
    subscriptionId: SubscriptionType.MARKET_ALERTS
  } satisfies Partial<Prisma.UserSubscriptionCreateManyInput>;

  await prisma.userSubscription.createMany({
    data: [
      { ...defaultForUser, id: '1', userId: '633180859' },
      { ...defaultForUser, id: '2', userId: '961646710' },
      { ...defaultForUser, id: '3', userId: '8335094347' }
    ],
    skipDuplicates: true
  });
}

async function fillSubTypes() {
  const alertSub = await prisma.subscription.upsert({
    where: { id: 1 },
    update: { name: 'Trade', price: 100 },
    create: {
      id: 1,
      name: 'Trade',
      price: 100
    }
  });

  const statsSub = await prisma.subscription.upsert({
    where: { id: 2 },
    update: { name: 'Statistics', price: 50 },
    create: {
      id: 2,
      name: 'Statistics',
      price: 50
    }
  });

  console.log('✅ Созданные/обновленные подписки:');
  console.log({ alertSub, statsSub });
}

main()
  .catch(e => {
    console.error('❌ Ошибка во время сидинга:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
