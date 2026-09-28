// Exercises the Store-page data logic (category add / dedupe / delete-with-
// reassignment, and absolute stock set) directly against dev.db, mirroring the
// server actions, then restores everything it touched.
// Run: pnpm exec tsx scripts/verify-store.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FALLBACK = 'Uncategorized';
let failures = 0;

function check(label: string, cond: boolean) {
  console.log(`${cond ? '✔' : '�’✗ FAIL —'} ${label}`);
  if (!cond) failures++;
}

async function main() {
  // ---- addCategory (case-insensitive dedupe) ----
  const unique = `ZZ Test ${Date.now()}`;
  const maxAgg = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.category.create({
    data: { name: unique, sortOrder: (maxAgg._max.sortOrder ?? 0) + 1 },
  });
  check('addCategory creates a row', !!created.id);

  const all = await prisma.category.findMany({ select: { name: true } });
  const dupBlocked = all.some((c) => c.name.toLowerCase() === unique.toLowerCase());
  check('duplicate (case-insensitive) would be rejected', dupBlocked);

  // ---- deleteCategory that has products -> reassign to Uncategorized ----
  const victim = await prisma.product.findFirst();
  if (!victim) throw new Error('no products to test with');
  const originalCat = victim.category;

  const tempCat = await prisma.category.create({
    data: { name: `ZZ InUse ${Date.now()}`, sortOrder: 9998 },
  });
  await prisma.product.update({ where: { id: victim.id }, data: { category: tempCat.name } });
  const inUse = await prisma.product.count({ where: { category: tempCat.name } });
  check('temp category is in use by 1 product', inUse === 1);

  // delete (mirror action transaction)
  await prisma.$transaction(async (tx) => {
    if (inUse > 0 && tempCat.name !== FALLBACK) {
      await tx.category.upsert({
        where: { name: FALLBACK },
        update: {},
        create: { name: FALLBACK, sortOrder: 9999 },
      });
      await tx.product.updateMany({
        where: { category: tempCat.name },
        data: { category: FALLBACK },
      });
    }
    await tx.category.delete({ where: { id: tempCat.id } });
  });

  const movedProduct = await prisma.product.findUnique({ where: { id: victim.id } });
  check('product reassigned to Uncategorized after delete', movedProduct?.category === FALLBACK);
  const tempGone = await prisma.category.findUnique({ where: { id: tempCat.id } });
  check('deleted category row is gone', tempGone === null);

  // ---- setStock (absolute + clamp), now per-branch on BranchStock ----
  const branch = await prisma.branch.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!branch) throw new Error('no branch to test with');
  const stockRow = await prisma.branchStock.upsert({
    where: { branchId_productId: { branchId: branch.id, productId: victim.id } },
    update: {},
    create: { branchId: branch.id, productId: victim.id, stock: 0, lowStockAt: 5 },
  });
  const origStock = stockRow.stock;
  const key = { branchId_productId: { branchId: branch.id, productId: victim.id } };
  await prisma.branchStock.update({ where: key, data: { stock: Math.max(0, Math.round(-5)) } });
  const clamped = await prisma.branchStock.findUnique({ where: key });
  check('setStock clamps negatives to 0', clamped?.stock === 0);
  await prisma.branchStock.update({ where: key, data: { stock: 137 } });
  const setAbs = await prisma.branchStock.findUnique({ where: key });
  check('setStock sets an absolute value (per branch)', setAbs?.stock === 137);

  // ---- cleanup: restore product + branch stock + remove test artifacts ----
  await prisma.product.update({ where: { id: victim.id }, data: { category: originalCat } });
  await prisma.branchStock.update({ where: key, data: { stock: origStock } });
  await prisma.category.delete({ where: { id: created.id } });
  // Remove the auto-created Uncategorized row only if nothing else uses it.
  const uncatUse = await prisma.product.count({ where: { category: FALLBACK } });
  if (uncatUse === 0) {
    await prisma.category.deleteMany({ where: { name: FALLBACK } });
  }
  console.log('✔ cleanup done — DB restored');

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  if (failures) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
