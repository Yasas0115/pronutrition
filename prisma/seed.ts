// Seeds only the essential system config: the payment methods and their auto
// discounts. No demo company, branches, staff or products — create the owner,
// company and first branch through the sign-up screen (/register) on first run.
// Run: pnpm db:seed   (safe to re-run; it upserts)
import { PrismaClient } from '@prisma/client';
import { DEFAULT_PAYMENT_METHODS } from '../lib/payment-methods';

const prisma = new PrismaClient();

async function main() {
  for (const m of DEFAULT_PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({
      where: { key: m.key },
      update: {},
      create: m,
    });
  }
  console.log('✔ Payment methods ready (Cash 10%, Card 7%, Koko 0%)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
