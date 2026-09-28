// Clears ALL business data + users so the app starts fresh at /register.
// Keeps PaymentMethod (Cash/Card/Koko discount config needed by checkout).
// Run: pnpm exec tsx scripts/wipe-data.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const r = await prisma.$transaction([
    prisma.stockMovement.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.branchStock.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany(),
    prisma.branch.deleteMany(),
    prisma.store.deleteMany(),
  ]);
  const names = ['stockMovements', 'saleItems', 'sales', 'branchStock', 'products', 'categories', 'users', 'branches', 'store'];
  names.forEach((n, i) => console.log(`${n}: ${r[i].count} deleted`));
  console.log('paymentMethods kept:', await prisma.paymentMethod.count());
}
main().finally(() => prisma.$disconnect());
