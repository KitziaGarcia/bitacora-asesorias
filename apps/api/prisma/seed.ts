import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seed } from './seedData';

const db = new PrismaClient();
seed(db)
  .then(async () => {
    console.log(`Seeded ${await db.class.count()} classes`);
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
