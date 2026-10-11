// Integration check for Phase 1: price history, cost snapshot on sales, Sri Lanka
// date boundaries. Uses throw-away fixtures (see scripts/fixtures.ts) and removes
// everything it made.
// Run: pnpm exec tsx scripts/verify-prices.ts
import { prisma } from '../lib/db';
import { recordPriceChange } from '../lib/price-history';
import { performCheckout } from '../lib/checkout';
import { startOfDay, startOfMonth, todayStr, parseDay } from '../lib/dates';
import { setupFixtures, assert, failureCount } from './fixtures';

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

  const f = await setupFixtures({
    products: [{ name: 'VERIFY Whey 2lb', price: 5000, cost: 3000, stock: 10 }],
  });
  const [product] = f.products;

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
    const sellOne = (qty: number) =>
      performCheckout({
        items: [{ productId: product.id, qty }], manualDiscount: 0, method: 'CASH', paid: 100000,
        branchId: f.branch.id, cashierId: null, cashierName: 'Verifier',
      });
    const r = await sellOne(2);
    const sale = await prisma.sale.findUniqueOrThrow({ where: { number: r.number }, include: { items: true } });
    assert(sale.items[0]?.unitCost === 3200, 'SaleItem.unitCost = buying price at sale time (3200)');

    // A later cost change must not rewrite the past sale.
    await prisma.product.update({ where: { id: product.id }, data: { cost: 4000 } });
    const again = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    assert(again.unitCost === 3200, 'past sale keeps its cost after the product cost changes');

    const r2 = await sellOne(1);
    const sale2 = await prisma.sale.findUniqueOrThrow({ where: { number: r2.number }, include: { items: true } });
    assert(sale2.items[0]?.unitCost === 4000, 'the next sale snapshots the new cost (4000)');
  } finally {
    console.log('\n▶ Cleanup');
    await f.teardown();
  }

  const bad = failureCount();
  console.log(bad === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${bad} CHECK(S) FAILED\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
