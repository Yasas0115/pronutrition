// Integration check for FIFO stock batches: old stock keeps its own buying
// price after a restock at a new price, and each sale's profit uses the cost of
// the units actually sold. Run: pnpm exec tsx scripts/verify-batches.ts
import { prisma } from '../lib/db';
import { performCheckout } from '../lib/checkout';
import { recordStockChange } from '../lib/stock';
import { createStockTransfer } from '../lib/transfers';
import { setupFixtures, assert, failureCount } from './fixtures';

async function main() {
  const f = await setupFixtures({
    products: [{ name: 'VERIFY Batch Whey', price: 1500, cost: 1000, stock: 10 }],
  });
  const [p] = f.products;
  const actor = { userId: null, userName: 'Verifier' };
  const sell = (qty: number) =>
    performCheckout({
      items: [{ productId: p.id, qty }],
      manualDiscount: 0, method: 'CASH', paid: 10_000_000,
      branchId: f.branch.id, cashierId: null, cashierName: 'Verifier',
    });
  const costOfLast = async () =>
    (await prisma.saleItem.findFirstOrThrow({ where: { productId: p.id }, orderBy: { sale: { number: 'desc' } } })).unitCost;

  try {
    // Opening 10 @1000. Restock 20 @1200 and raise the retail price to 1800.
    await recordStockChange(prisma, { branchId: f.branch.id, productId: p.id, productName: p.name, delta: 20, type: 'RESTOCK', unitCost: 1200, ...actor });
    await prisma.product.update({ where: { id: p.id }, data: { cost: 1200, price: 1800 } });

    await sell(4);
    assert((await costOfLast()) === 1000, 'first 4 units sold at the OLD cost (1000), not the new 1200');

    await sell(6);
    assert((await costOfLast()) === 1000, 'last 6 old units still cost 1000');

    await sell(5);
    assert((await costOfLast()) === 1200, 'next units come from the new batch (1200)');

    const batches = await prisma.stockBatch.findMany({ where: { branchId: f.branch.id, productId: p.id }, orderBy: { receivedAt: 'asc' } });
    assert(batches.reduce((n, b) => n + b.qtyRemaining, 0) === 15, '15 units left across batches');

    // A line spanning two batches gets the weighted average cost.
    await recordStockChange(prisma, { branchId: f.branch.id, productId: p.id, productName: p.name, delta: 5, type: 'RESTOCK', unitCost: 1400, ...actor });
    // remaining: 15 @1200, 5 @1400. Sell 18 -> 15@1200 + 3@1400 = 22200/18 = 1233.33 -> 1233
    await sell(18);
    assert((await costOfLast()) === 1233, 'line spanning 2 batches uses weighted average cost');

    // Transfers carry the batch cost to the receiving branch.
    const other = await f.makeBranch('B');
    await createStockTransfer({ fromBranchId: f.branch.id, toBranchId: other.id, items: [{ productId: p.id, qty: 2 }], userId: null, userName: 'Verifier' });
    const moved = await prisma.stockBatch.findMany({ where: { branchId: other.id, productId: p.id } });
    assert(moved.length === 1 && moved[0].unitCost === 1400 && moved[0].qtyRemaining === 2, 'transferred units keep their buying price (1400)');
  } finally {
    await f.teardown();
    await prisma.$disconnect();
  }
  if (failureCount() > 0) process.exit(1);
  console.log('\nAll batch checks passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
