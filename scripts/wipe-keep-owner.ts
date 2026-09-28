// Clears all business data but keeps the OWNER login(s), so the owner can sign
// straight back in to a clean shop. Deletes sales, products, categories, stock
// and stock history, and every STAFF user. Keeps the company settings (Store
// row — name, logo, tax…; invoice numbers restart at 1001), the payment methods,
// and the branches (pass --branches to delete those too).
// Run: pnpm exec tsx scripts/wipe-keep-owner.ts                  (dry run: counts only)
//      pnpm exec tsx scripts/wipe-keep-owner.ts --yes            (really delete)
//      pnpm exec tsx scripts/wipe-keep-owner.ts --yes --branches (also delete branches)
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes');
  const withBranches = args.includes('--branches');

  const owners = await prisma.user.findMany({ where: { role: 'OWNER' }, select: { email: true } });
  if (!owners.length) throw new Error('No OWNER account found — nothing to keep. Aborting.');
  console.log('Keeping owner(s):', owners.map((o) => o.email).join(', '));

  const counts = {
    stockMovements: await prisma.stockMovement.count(),
    saleItems: await prisma.saleItem.count(),
    sales: await prisma.sale.count(),
    branchStock: await prisma.branchStock.count(),
    products: await prisma.product.count(),
    categories: await prisma.category.count(),
    staffUsers: await prisma.user.count({ where: { role: { not: 'OWNER' } } }),
    ...(withBranches ? { branches: await prisma.branch.count() } : {}),
  };

  if (!confirmed) {
    console.log('DRY RUN — nothing deleted. Would delete:');
    Object.entries(counts).forEach(([n, c]) => console.log(`  ${n}: ${c}`));
    console.log('Run again with --yes to delete.');
    return;
  }

  const r = await prisma.$transaction([
    prisma.stockMovement.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.branchStock.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany({ where: { role: { not: 'OWNER' } } }),
    ...(withBranches ? [prisma.branch.deleteMany()] : []),
    prisma.store.updateMany({ data: { nextInvoice: 1001 } }),
  ]);
  Object.keys(counts).forEach((n, i) => console.log(`${n}: ${r[i].count} deleted`));
  console.log('Invoice numbers reset to 1001. Payment methods kept:', await prisma.paymentMethod.count());
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
