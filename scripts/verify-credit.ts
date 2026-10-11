// Integration check for Phase 2: the customer / payment rules, credit sales,
// wholesale pricing and credit settlement, against the real database. Builds its
// own throw-away fixtures and removes them (see scripts/fixtures.ts).
// Run: pnpm exec tsx scripts/verify-credit.ts
import { prisma } from '../lib/db';
import { performCheckout, type CheckoutCore } from '../lib/checkout';
import { settleCustomerPayment } from '../lib/credit';
import { receivablesByCustomer, dueByCustomerId, customerBalance } from '../lib/receivables';
import { setupFixtures, assert, rejects, stockAt, failureCount } from './fixtures';

async function main() {
  const f = await setupFixtures({
    products: [
      { name: 'VERIFY Whey', price: 5000, cost: 3000, stock: 50 },
      { name: 'VERIFY Bar', price: 400, cost: 250, stock: 50 },
    ],
  });
  const [whey, bar] = f.products;

  const base = (over: Partial<CheckoutCore>): CheckoutCore => ({
    items: [{ productId: bar.id, qty: 1 }],
    manualDiscount: 0,
    method: 'CASH',
    paid: 100000,
    branchId: f.branch.id,
    cashierId: null,
    cashierName: 'Verifier',
    ...over,
  });
  const sale = (number: number) =>
    prisma.sale.findUniqueOrThrow({ where: { number }, include: { items: true, payments: true } });

  try {
    const shop = await f.makeCustomer('Shop A', 'SHOP');
    const person = await f.makeCustomer('Person B', 'RETAIL');

    // ---------------------------------------------------------------- 1. walk-in
    console.log('\n▶ Walk-in customers: Cash / Card only');
    const cash = await performCheckout(base({ method: 'CASH' }));
    assert(cash.methodDiscount === 40, 'walk-in cash sale gets the 10% method discount (Rs 40)');
    assert(cash.total === 360 && cash.change === 100000 - 360, 'cash total + change correct');
    const cashSale = await sale(cash.number);
    assert(cashSale.customerId === null && cashSale.saleType === 'RETAIL', 'stored as a retail walk-in sale');
    assert(cashSale.payments.length === 1 && cashSale.payments[0].amount === 360 && cashSale.payments[0].method === 'CASH',
      'one CASH payment row for the amount kept (change excluded)');

    const card = await performCheckout(base({ method: 'CARD', paid: 0 }));
    assert(card.total === 372 && card.paid === 372, 'walk-in card sale ok (7% off, paid = total)');

    assert(await rejects(() => performCheckout(base({ method: 'KOKO' })), 'registered customer'), 'walk-in + Koko is rejected');
    assert(await rejects(() => performCheckout(base({ method: 'BANK', paid: 0 })), 'registered customer'), 'walk-in + Bank transfer is rejected');
    assert(await rejects(() => performCheckout(base({ method: 'CREDIT', paid: 0 })), 'registered customer'), 'walk-in + Credit is rejected');
    assert(await rejects(() => performCheckout(base({ method: 'NOPE' })), 'not available'), 'unknown payment method is rejected');

    // -------------------------------------------------------- 2. registered customer
    console.log('\n▶ Registered customers: Koko and Bank transfer');
    const koko = await performCheckout(base({ method: 'KOKO', paid: 0, customerId: person.id }));
    assert(koko.total === 400 && koko.customerName === person.name, 'Koko sale ok for a registered customer, name on receipt');
    const bank = await performCheckout(base({ method: 'BANK', paid: 0, customerId: person.id }));
    const bankSale = await sale(bank.number);
    assert(bankSale.payments[0]?.method === 'BANK' && bankSale.customerId === person.id, 'Bank transfer recorded against the customer');
    assert(await rejects(() => performCheckout(base({ method: 'CASH', customerId: 'does-not-exist' })), 'no longer registered'),
      'an unknown customer id is rejected');

    // ------------------------------------------------------------------ 3. wholesale
    console.log('\n▶ Wholesale');
    assert(await rejects(() => performCheckout(base({ saleType: 'WHOLESALE' })), 'registered customer'),
      'wholesale without a customer is rejected');
    const wh = await performCheckout(
      base({
        saleType: 'WHOLESALE',
        customerId: shop.id,
        method: 'CASH',
        items: [{ productId: whey.id, qty: 10, price: 4200 }],
      }),
    );
    assert(wh.methodDiscount === 0, 'wholesale skips the cash 10% method discount');
    assert(wh.subtotal === 42000 && wh.total === 42000, 'line price override applied (10 × 4,200)');
    const whSale = await sale(wh.number);
    assert(whSale.saleType === 'WHOLESALE' && whSale.customerId === shop.id, 'stored as a wholesale sale to the shop');
    assert(whSale.items[0].price === 4200 && whSale.items[0].listPrice === 5000, 'actual price 4,200 vs list price 5,000 both kept');
    assert(whSale.items[0].unitCost === 3000, 'buying price snapshotted for profit');

    const retailOverride = await performCheckout(base({ items: [{ productId: whey.id, qty: 1, price: 1 }], method: 'CARD', paid: 0 }));
    assert(retailOverride.subtotal === 5000, 'a price override is ignored on a retail sale');

    // --------------------------------------------------------------------- 4. credit
    console.log('\n▶ Credit sales');
    const before = await stockAt(f.branch.id, whey.id);
    const c1 = await performCheckout(base({
      method: 'CREDIT', customerId: person.id, paid: 1000, paidVia: 'CASH',
      items: [{ productId: whey.id, qty: 1 }],
    }));
    const c1Sale = await sale(c1.number);
    assert(c1.total === 5000 && c1.paid === 1000 && c1.balanceDue === 4000, 'Rs 5,000 credit sale, 1,000 paid now → 4,000 owed');
    assert(c1Sale.balanceDue === 4000 && c1Sale.paid === 1000, 'balance stored on the sale');
    assert(c1Sale.payments.length === 1 && c1Sale.payments[0].amount === 1000 && c1Sale.payments[0].method === 'CASH',
      'the paid-now amount is one CASH payment row');
    assert((await stockAt(f.branch.id, whey.id)) === before - 1, 'credit sale still takes the stock out');

    const c2 = await performCheckout(base({
      method: 'CREDIT', customerId: person.id, paid: 0, items: [{ productId: bar.id, qty: 5 }],
    }));
    const c2Sale = await sale(c2.number);
    assert(c2.total === 2000 && c2.balanceDue === 2000 && c2Sale.payments.length === 0, 'nothing paid now → full amount owed, no payment row');

    assert(await rejects(() => performCheckout(base({ method: 'CREDIT', customerId: person.id, paid: 999999 })), 'more than the total'),
      'paid-now above the total is rejected');
    assert(await rejects(() => performCheckout(base({ method: 'CREDIT', customerId: person.id, paid: 100, paidVia: 'KOKO' })), 'cash, card or bank'),
      'paid-now must be cash / card / bank');

    const due = async () =>
      (await prisma.sale.aggregate({ where: { customerId: person.id }, _sum: { balanceDue: true } }))._sum.balanceDue ?? 0;
    assert((await due()) === 6000, `customer owes 4,000 + 2,000 = 6,000 (got ${await due()})`);

    // ------------------------------------------- shared "who owes" roll-ups (lib/receivables)
    console.log('\n▶ Receivables: one definition of "owes"');
    const rowOf = async (branchId: string | null) =>
      (await receivablesByCustomer({ branchId })).find((r) => r.customerId === person.id);
    const fresh = await rowOf(f.branch.id);
    assert(!!fresh && fresh.due === 6000 && fresh.count === 2, `Receivables lists Person B owing 6,000 on 2 sales (got ${fresh?.due}/${fresh?.count})`);
    assert(fresh!.b0 === 6000 && fresh!.b30 + fresh!.b60 + fresh!.b90 === 0, 'new debts sit in the 0–30 day bucket');
    assert((await dueByCustomerId()).get(person.id) === 6000, 'the till warning sees the same 6,000');
    const bal = await customerBalance(person.id);
    assert(bal.due === 6000 && bal.bought === 400 + 400 + 5000 + 2000, `the ledger sees 6,000 owed of 7,800 bought (got ${bal.due}/${bal.bought})`);
    assert(!(await rowOf('no-such-branch')), 'a branch filter leaves out debts from other branches');
    // Age the older sale 100 days: it must move to the 90+ bucket and stay the oldest.
    await prisma.sale.update({ where: { number: c1.number }, data: { createdAt: new Date(Date.now() - 100 * 86_400_000) } });
    const aged = await rowOf(f.branch.id);
    assert(aged?.b90 === 4000 && aged?.b0 === 2000 && aged?.due === 6000, `ageing: 4,000 in 90+, 2,000 in 0–30 (got ${aged?.b90}/${aged?.b0})`);

    // ------------------------------------------------------------------ 5. settlement
    console.log('\n▶ Settlement: oldest sale first');
    const s1 = await settleCustomerPayment({
      customerId: person.id, amount: 5000, method: 'BANK', note: 'slip 1',
      branchId: f.branch.id, userId: null, userName: 'Verifier',
    });
    assert(s1.allocations.length === 2, 'Rs 5,000 spans two sales');
    assert(s1.allocations[0].saleNumber === c1.number && s1.allocations[0].amount === 4000, 'older sale cleared first (4,000)');
    assert(s1.allocations[1].saleNumber === c2.number && s1.allocations[1].amount === 1000, 'remaining 1,000 goes to the newer sale');
    assert(s1.remainingDue === 1000 && (await due()) === 1000, 'customer now owes 1,000');
    const c1After = await sale(c1.number);
    assert(c1After.balanceDue === 0 && c1After.paid === 5000, 'first sale: due 0, paid 5,000 (cumulative)');
    const settleRows = await prisma.salePayment.findMany({ where: { settlementId: s1.settlementId } });
    assert(settleRows.length === 2 && settleRows.every((r) => r.kind === 'SETTLEMENT' && r.method === 'BANK'),
      'two SETTLEMENT rows share one settlementId, method BANK');
    assert(settleRows.every((r) => r.createdAt instanceof Date), 'each payment has its own date + time');

    assert(await rejects(() => settleCustomerPayment({
      customerId: person.id, amount: 1001, method: 'CASH', branchId: f.branch.id, userId: null, userName: 'Verifier',
    }), 'more than is due'), 'over-payment is rejected');
    assert((await due()) === 1000, 'a rejected payment changes nothing');
    assert(await rejects(() => settleCustomerPayment({
      customerId: person.id, amount: 100, method: 'KOKO', branchId: f.branch.id, userId: null, userName: 'Verifier',
    }), 'cash, card or bank'), 'Koko cannot be used to settle a debt');

    const s2 = await settleCustomerPayment({
      customerId: person.id, amount: 1000, method: 'CASH', branchId: f.branch.id, userId: null, userName: 'Verifier',
    });
    assert(s2.remainingDue === 0 && (await due()) === 0, 'final payment clears the account');
    assert(await rejects(() => settleCustomerPayment({
      customerId: person.id, amount: 1, method: 'CASH', branchId: f.branch.id, userId: null, userName: 'Verifier',
    }), 'nothing outstanding'), 'paying a cleared account is rejected');

    // ---------------------------------------------------- 6. money in = payment rows
    console.log('\n▶ Collections add up');
    const collected = await prisma.salePayment.aggregate({
      where: { customerId: person.id }, _sum: { amount: true },
    });
    // Person B: koko 400 + bank 400 + credit paid-now 1,000 + settlements 5,000 + 1,000
    assert((collected._sum.amount ?? 0) === 400 + 400 + 1000 + 5000 + 1000,
      `all money received from Person B = ${collected._sum.amount} (expected 7,800)`);
  } finally {
    console.log('\n▶ Cleanup');
    await f.teardown();
  }

  const bad = failureCount();
  console.log(bad === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${bad} CHECK(S) FAILED\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
