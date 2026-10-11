// Integration check for the checkout core against the real database.
// Runs a sale at a branch, asserts totals + per-branch stock decrement +
// persistence, the payment-method discount and the out-of-stock guard, using its
// own throw-away branch + products (see scripts/fixtures.ts), then removes them.
// Run: pnpm exec tsx scripts/verify-checkout.ts
import { prisma } from '../lib/db';
import { performCheckout } from '../lib/checkout';
import { setupFixtures, assert, rejects, stockAt, failureCount } from './fixtures';

async function main() {
  const f = await setupFixtures({
    products: [
      { name: 'VERIFY Whey 2lb', price: 38000, cost: 30000, stock: 10 },
      { name: 'VERIFY Protein Bar', price: 800, cost: 500, stock: 10 },
    ],
  });
  const [whey, bar] = f.products;

  try {
    const buyer = await f.makeCustomer('Test Buyer');
    const manualDiscount = 500;
    const expectSubtotal = whey.price * 1 + bar.price * 2;
    // KOKO has a 0% method discount, so the maths is manual-discount only.
    const expectTotal = expectSubtotal - manualDiscount;

    console.log(`\n▶ Checkout at ${f.branch.name} (1× whey, 2× bar, Rs 500 off, KOKO)`);
    const r = await performCheckout({
      items: [
        { productId: whey.id, qty: 1 },
        { productId: bar.id, qty: 2 },
      ],
      manualDiscount,
      method: 'KOKO',
      paid: 0,
      customerId: buyer.id,
      branchId: f.branch.id,
      cashierId: null,
      cashierName: 'Verifier',
    });

    assert(r.subtotal === expectSubtotal, `subtotal = ${r.subtotal} (expected ${expectSubtotal})`);
    assert(r.discount === manualDiscount, `discount = ${r.discount}`);
    assert(r.methodDiscount === 0, `koko method discount = ${r.methodDiscount}`);
    assert(r.total === expectTotal, `total = ${r.total} (expected ${expectTotal})`);
    assert(r.branchName === f.branch.name, `receipt tagged with branch (${r.branchName})`);
    assert(r.items.length === 2, 'receipt has 2 line items');
    assert(r.number >= 1001, `invoice number assigned (#${r.number})`);

    assert((await stockAt(f.branch.id, whey.id)) === 9, 'whey stock 10 → 9');
    assert((await stockAt(f.branch.id, bar.id)) === 8, 'bar stock 10 → 8');

    const persisted = await prisma.sale.findUnique({ where: { number: r.number }, include: { items: true } });
    assert(!!persisted, 'sale row persisted');
    assert(persisted!.branchId === f.branch.id, 'sale persisted with branchId');
    assert(persisted!.items.length === 2, 'sale items persisted');
    assert(persisted!.items.every((i) => i.unitCost != null), 'every line carries its buying-price snapshot');

    console.log('\n▶ Payment-method discount (CASH = 10%)');
    const cash = await performCheckout({
      items: [{ productId: bar.id, qty: 1 }],
      manualDiscount: 0,
      method: 'CASH',
      paid: 5000,
      branchId: f.branch.id,
      cashierId: null,
      cashierName: 'Verifier',
    });
    const expectCashDisc = Math.round((bar.price * 10) / 100);
    assert(cash.methodDiscount === expectCashDisc, `cash 10% discount = ${cash.methodDiscount} (expected ${expectCashDisc})`);
    assert(cash.total === bar.price - expectCashDisc, 'cash total applied the discount');
    assert(cash.change === 5000 - cash.total, `change = ${cash.change}`);

    console.log('\n▶ Cash received below the total');
    assert(await rejects(() => performCheckout({
      items: [{ productId: bar.id, qty: 1 }], manualDiscount: 0, method: 'CASH', paid: 10,
      branchId: f.branch.id, cashierId: null, cashierName: 'Verifier',
    }), 'less than the total'), 'short cash is rejected');

    console.log('\n▶ Out-of-stock guard (order 99,999 of whey)');
    assert(await rejects(() => performCheckout({
      items: [{ productId: whey.id, qty: 99999 }],
      manualDiscount: 0, method: 'CASH', paid: 999999999, branchId: f.branch.id, cashierId: null, cashierName: 'Verifier',
    }), 'not enough stock'), 'over-ordering is rejected');
    assert((await stockAt(f.branch.id, whey.id)) === 9, 'a rejected sale leaves stock untouched');
  } finally {
    console.log('\n▶ Cleanup');
    await f.teardown();
  }

  const bad = failureCount();
  console.log(bad === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${bad} CHECK(S) FAILED\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
