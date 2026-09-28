// Integration check for the checkout core against the real SQLite DB.
// Runs a sale at a branch, asserts totals + per-branch stock decrement +
// persistence, tests the out-of-stock guard, then rolls everything back so seed
// data is untouched.
import { prisma } from '../lib/db';
import { performCheckout } from '../lib/checkout';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✔', msg);
  else { console.log('  x FAIL:', msg); failures++; }
}

async function stockAt(branchId: string, productId: string) {
  const row = await prisma.branchStock.findUnique({ where: { branchId_productId: { branchId, productId } } });
  return row?.stock ?? 0;
}

async function main() {
  const branch = await prisma.branch.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!branch) throw new Error('No branch found — run pnpm db:seed first.');

  const whey = await prisma.product.findFirst({ where: { name: { contains: 'Whey 2lb' } } });
  const bar = await prisma.product.findFirst({ where: { name: { contains: 'Protein Bar (Chocolate)' } } });
  if (!whey || !bar) throw new Error('Seed products missing — run pnpm db:seed first.');

  // Make sure the branch has enough stock to sell (top up for a deterministic test).
  await prisma.branchStock.upsert({ where: { branchId_productId: { branchId: branch.id, productId: whey.id } }, update: { stock: 10 }, create: { branchId: branch.id, productId: whey.id, stock: 10, lowStockAt: 5 } });
  await prisma.branchStock.upsert({ where: { branchId_productId: { branchId: branch.id, productId: bar.id } }, update: { stock: 10 }, create: { branchId: branch.id, productId: bar.id, stock: 10, lowStockAt: 5 } });

  const wheyStock0 = await stockAt(branch.id, whey.id);
  const barStock0 = await stockAt(branch.id, bar.id);
  const expectSubtotal = whey.price * 1 + bar.price * 2;
  const manualDiscount = 500;
  // Use KOKO (0% method discount) so the maths is manual-discount only.
  const expectTotal = expectSubtotal - manualDiscount; // taxPercent seeded at 0
  const paid = 40000;

  console.log(`\n▶ Checkout at ${branch.name} (1× whey, 2× bar, Rs 500 off, KOKO ${paid})`);
  const r = await performCheckout({
    items: [
      { productId: whey.id, qty: 1 },
      { productId: bar.id, qty: 2 },
    ],
    manualDiscount,
    method: 'KOKO',
    paid,
    customerName: 'Test Buyer',
    branchId: branch.id,
    cashierId: null,
    cashierName: 'Verifier',
  });

  assert(r.subtotal === expectSubtotal, `subtotal = ${r.subtotal} (expected ${expectSubtotal})`);
  assert(r.discount === manualDiscount, `discount = ${r.discount}`);
  assert(r.methodDiscount === 0, `koko method discount = ${r.methodDiscount}`);
  assert(r.total === expectTotal, `total = ${r.total} (expected ${expectTotal})`);
  assert(r.branchName === branch.name, `receipt tagged with branch (${r.branchName})`);
  assert(r.items.length === 2, `receipt has 2 line items`);
  assert(r.number >= 1001, `invoice number assigned (#${r.number})`);

  assert((await stockAt(branch.id, whey.id)) === wheyStock0 - 1, `whey stock ${wheyStock0} → ${wheyStock0 - 1}`);
  assert((await stockAt(branch.id, bar.id)) === barStock0 - 2, `bar stock ${barStock0} → ${barStock0 - 2}`);

  const persisted = await prisma.sale.findUnique({ where: { number: r.number }, include: { items: true } });
  assert(!!persisted, 'sale row persisted');
  assert(persisted!.branchId === branch.id, 'sale persisted with branchId');
  assert(persisted!.items.length === 2, 'sale items persisted');

  console.log('\n▶ Payment-method discount (CASH = 10%)');
  const cash = await performCheckout({
    items: [{ productId: bar.id, qty: 1 }],
    manualDiscount: 0,
    method: 'CASH',
    paid: whey.price + bar.price,
    branchId: branch.id,
    cashierId: null,
    cashierName: 'Verifier',
  });
  const expectCashDisc = Math.round((bar.price * 10) / 100);
  assert(cash.methodDiscount === expectCashDisc, `cash 10% discount = ${cash.methodDiscount} (expected ${expectCashDisc})`);
  assert(cash.total === bar.price - expectCashDisc, `cash total applied the discount`);

  console.log('\n▶ Out-of-stock guard (order 99,999 of whey)');
  let threw = false;
  try {
    await performCheckout({
      items: [{ productId: whey.id, qty: 99999 }],
      manualDiscount: 0, method: 'KOKO', paid: 999999999, branchId: branch.id, cashierId: null, cashierName: 'Verifier',
    });
  } catch { threw = true; }
  assert(threw, 'over-ordering is rejected');

  // ---- Cleanup: remove the test sales and restore stock ----
  console.log('\n▶ Cleanup');
  await prisma.sale.delete({ where: { number: r.number } });
  await prisma.sale.delete({ where: { number: cash.number } });
  await prisma.branchStock.update({ where: { branchId_productId: { branchId: branch.id, productId: whey.id } }, data: { stock: wheyStock0 } });
  await prisma.branchStock.update({ where: { branchId_productId: { branchId: branch.id, productId: bar.id } }, data: { stock: barStock0 } });
  assert((await stockAt(branch.id, whey.id)) === wheyStock0, 'stock restored to pre-test values');

  console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
