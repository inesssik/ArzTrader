import { PrismaPg } from '@prisma/adapter-pg';
import { env } from 'prisma/config';
import { PrismaClient } from './generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env('DATABASE_URL')
  })
});

async function main() {
  console.log('🌱 Починаємо наповнення бази даних (Seeding)...');

  console.log(await prisma.item.findMany())

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

  console.log('✅ Створені/оновлені підписки:');
  console.log({ alertSub, statsSub });
}

main()
  .catch(e => {
    console.error('❌ Помилка під час сідінгу:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
