// Integration check for Phase 1: price history, cost snapshot on sales, Sri Lanka
// date boundaries. Creates its own throw-away branch + product (no seed data is
// assumed) and removes everything it made, restoring the invoice counter.
// Run: pnpm exec tsx scripts/verify-prices.ts
import { prisma } from '../lib/db';
import { recordStockChange } from '../lib/stock';
import { recordPriceChange } from '../lib/price-history';
import { performCheckout } from '../lib/checkout';
import { startOfDay, startOfMonth, todayStr, parseDay } from '../lib/dates';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✔', msg);
  else { console.log('  x FAIL:', msg); failures++; }
}

async function main() {
  // ---- 0. Date helpers (pure) ----
  console.log('\n▶ Sri Lanka day / month boundaries');
  // 20:00 UTC on 10 Oct is 01:30 on 11 Oct in Colombo.
  const lateUtc = new Date('2026-10-10T20:00:00.000Z');
  assert(startOfDay(lateUtc).toISOString() === '2026-10-10T18:30:00.000Z', 'startOfDay → 00:00 Colombo (18:30Z prev day)');
  assert(todayStr(lateUtc) === '2026-10-11', 'todayStr uses the Colombo date');
  assert(startOfMonth(new Date('2026-10-31T19:00:00.000Z')).toISOString() === '2026-10-31T18:30:00.000Z',
    'startOfMonth after local midnight rolls into the next month (Nov 1 Colombo)');
  assert(parseDay('2026-10-11')?.toISOString() === '2026-10-10T18:30:00.000Z', 'parseDay anchors a date to Colombo midnight');

  // ---- fixtures ----
  const storeBefore = await prisma.store.findFirst();
  const createdStore = !storeBefore;
  const store = storeBefore ?? (await prisma.store.create({ data: { name: 'Verify Store' } }));
  const startInvoice = store.nextInvoice;

  const branch = await prisma.branch.create({ data: { name: `VERIFY-${Date.now()}` } });
  const product = await prisma.product.create({
    data: { name: 'VERIFY Whey 2lb', category: 'Verify', price: 5000, cost: 3000 },
  });
  await recordStockChange(prisma, {
    branchId: branch.id, productId: product.id, productName: product.name,
    delta: 10, type: 'INITIAL', userName: 'Verifier',
  });

  try {
    // ---- 1. Price history ----
    console.log('\n▶ recordPriceChange');
    const wrote = await recordPriceChange(prisma, {
      productId: product.id, productName: product.name,
      oldPrice: 5000, newPrice: 5500, oldCost: 3000, newCost: 3200,
      source: 'EDIT', userName: 'Verifier',
    });
    assert(wrote, 'a changed price/cost writes a row');
    const row = await prisma.productPriceHistory.findFirst({ where: { productId: product.id }, orderBy: { createdAt: 'desc' } });
    assert(row?.oldPrice === 5000 && row.newPrice === 5500, 'retail old → new stored');
    assert(row?.oldCost === 3000 && row.newCost === 3200, 'buying old → new stored');
    assert(row?.onHandUnits === 10, 'company-wide on-hand (10) snapshotted');
    assert(row?.createdAt instanceof Date, 'date + time recorded');

    const noop = await recordPriceChange(prisma, {
      productId: product.id, productName: product.name,
      oldPrice: 5500, newPrice: 5500, oldCost: 3200, newCost: 3200, source: 'EDIT',
    });
    assert(!noop, 'an unchanged price/cost writes nothing');
    const baseline = await recordPriceChange(prisma, {
      productId: product.id, productName: product.name,
      oldPrice: 0, newPrice: 5500, oldCost: 0, newCost: 3200, source: 'CREATE',
    });
    assert(baseline, 'a new product always writes a baseline row');

    // ---- 2. Sale snapshots the buying price ----
    console.log('\n▶ Checkout snapshots unitCost');
    await prisma.product.update({ where: { id: product.id }, data: { price: 5500, cost: 3200 } });
    const r = await performCheckout({
      items: [{ productId: product.id, qty: 2 }], manualDiscount: 0, method: 'KOKO', paid: 0,
      branchId: branch.id, cashierId: null, cashierName: 'Verifier',
    });
    const sale = await prisma.sale.findUniqueOrThrow({ where: { number: r.number }, include: { items: true } });
    assert(sale.items[0]?.unitCost === 3200, 'SaleItem.unitCost = buying price at sale time (3200)');

    // A later cost change must not rewrite the past sale.
    await prisma.product.update({ where: { id: product.id }, data: { cost: 4000 } });
    const again = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    assert(again.unitCost === 3200, 'past sale keeps its cost after the product cost changes');

    const r2 = await performCheckout({
      items: [{ productId: product.id, qty: 1 }], manualDiscount: 0, method: 'KOKO', paid: 0,
      branchId: branch.id, cashierId: null, cashierName: 'Verifier',
    });
    const sale2 = await prisma.sale.findUniqueOrThrow({ where: { number: r2.number }, include: { items: true } });
    assert(sale2.items[0]?.unitCost === 4000, 'the next sale snapshots the new cost (4000)');
  } finally {
    // ---- cleanup ----
    console.log('\n▶ Cleanup');
    await prisma.sale.deleteMany({ where: { branchId: branch.id } }); // cascades items
    await prisma.stockMovement.deleteMany({ where: { branchId: branch.id } });
    await prisma.productPriceHistory.deleteMany({ where: { productId: product.id } });
    await prisma.branchStock.deleteMany({ where: { branchId: branch.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
    if (createdStore) await prisma.store.delete({ where: { id: store.id } });
    else await prisma.store.update({ where: { id: store.id }, data: { nextInvoice: startInvoice } });
  }

  console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
