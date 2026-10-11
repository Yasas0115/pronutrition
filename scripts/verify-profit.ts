// Integration check for Phase 3: expenses, petty cash, worker salaries, the till
// float, and the profit & loss / cash-drawer reports — against the real database,
// with hand-computed expected figures. Uses throw-away fixtures (scripts/fixtures.ts).
// Run: pnpm exec tsx scripts/verify-profit.ts
import { prisma } from '../lib/db';
import { performCheckout } from '../lib/checkout';
import { settleCustomerPayment } from '../lib/credit';
import { addExpense, voidExpense, paySalary, voidSalaryPayment, setBranchFloat } from '../lib/finance';
import { computeProfitLoss, computeCashDrawer, floatAt } from '../lib/reports';
import { startOfDay, endOfDay, todayStr } from '../lib/dates';
import { setupFixtures, assert, rejects, failureCount } from './fixtures';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const f = await setupFixtures({
    products: [
      { name: 'VERIFY Whey', price: 5000, cost: 3000, stock: 50 },
      { name: 'VERIFY Bar', price: 400, cost: 250, stock: 50 },
    ],
  });
  const [whey, bar] = f.products;
  const actor = { userId: null, userName: 'Verifier' };

  const sell = (over: Partial<Parameters<typeof performCheckout>[0]>) =>
    performCheckout({
      items: [{ productId: bar.id, qty: 1 }],
      manualDiscount: 0,
      method: 'CASH',
      paid: 100000,
      branchId: f.branch.id,
      cashierId: null,
      cashierName: 'Verifier',
      ...over,
    });

  try {
    const shop = await f.makeCustomer('Shop', 'SHOP');
    const person = await f.makeCustomer('Person');
    const today = todayStr();
    const yesterday = todayStr(new Date(Date.now() - 24 * 3600 * 1000));

    // ------------------------------------------------------------ sales
    console.log('\n▶ Sales (net sales / cost of goods)');
    await sell({ items: [{ productId: bar.id, qty: 2 }] }); // S1 retail cash: 800 − 80 = 720, cost 500
    await sell({ saleType: 'WHOLESALE', customerId: shop.id, items: [{ productId: whey.id, qty: 10, price: 4200 }] }); // S2: 42,000, cost 30,000
    await sell({ method: 'CARD', paid: 0, items: [{ productId: whey.id, qty: 1 }] }); // S3: 5000 − 350 = 4,650, cost 3,000
    const s4 = await sell({}); // S4 retail cash: 400 − 40 = 360, cost 250 …
    await prisma.saleItem.updateMany({ where: { sale: { number: s4.number } }, data: { unitCost: null } }); // … but pretend it pre-dates cost snapshots
    const c1 = await sell({ method: 'CREDIT', customerId: person.id, paid: 0 }); // C1: 400, cost 250, nothing paid yet
    await settleCustomerPayment({ customerId: person.id, amount: 400, method: 'CASH', branchId: f.branch.id, ...actor });
    assert(c1.balanceDue === 400, 'credit sale left Rs 400 owing, then settled in cash');

    const range = { from: startOfDay(new Date()), to: endOfDay(new Date()) };
    let pl = await computeProfitLoss(range, f.branch.id);

    assert(pl.sales.count === 5, `5 sales counted (got ${pl.sales.count})`);
    assert(pl.sales.net === 48130, `net sales = 720+42,000+4,650+360+400 = 48,130 (got ${pl.sales.net})`);
    assert(pl.sales.cogs === 34000, `cost of goods = 500+30,000+3,000+250+250 = 34,000 (got ${pl.sales.cogs})`);
    assert(pl.sales.grossProfit === 14130, `gross profit = 14,130 (got ${pl.sales.grossProfit})`);
    assert(pl.byType.RETAIL.net === 6130 && pl.byType.RETAIL.cogs === 4000 && pl.byType.RETAIL.grossProfit === 2130,
      `retail: net 6,130 · cost 4,000 · gross 2,130 (got ${pl.byType.RETAIL.net}/${pl.byType.RETAIL.cogs}/${pl.byType.RETAIL.grossProfit})`);
    assert(pl.byType.WHOLESALE.net === 42000 && pl.byType.WHOLESALE.grossProfit === 12000 && pl.byType.WHOLESALE.count === 1,
      `wholesale: net 42,000 · gross 12,000 (got ${pl.byType.WHOLESALE.net}/${pl.byType.WHOLESALE.grossProfit})`);
    assert(pl.estimatedLines === 1, `the pre-snapshot line is flagged as estimated (got ${pl.estimatedLines})`);
    assert(pl.expenses.total === 0 && pl.netProfit === 14130, 'no expenses yet → net profit equals gross profit');

    // ------------------------------------------------- expense validation
    console.log('\n▶ Expense rules');
    await prisma.expenseCategory.createMany({ data: [{ name: 'VERIFY Rent' }, { name: 'VERIFY Transport' }] });
    const base = { category: 'VERIFY Rent', amount: 1000, date: today, paidVia: 'CASH', branchId: f.branch.id, ...actor };
    assert(await rejects(() => addExpense({ ...base, amount: 0 }), 'amount'), 'zero amount is rejected');
    assert(await rejects(() => addExpense({ ...base, category: 'Nope' }), 'category'), 'a category not on the list is rejected');
    assert(await rejects(() => addExpense({ ...base, date: todayStr(new Date(Date.now() + 3 * 24 * 3600 * 1000)) }), 'future'),
      'a future date is rejected');
    assert(await rejects(() => addExpense({ ...base, paidVia: 'CRYPTO' }), 'cash, bank or card'), 'an unknown payment way is rejected');
    assert(await rejects(() => addExpense({ ...base, kind: 'PETTY_CASH', description: 'tea' }), 'who took'),
      'petty cash must say who took it');
    assert(await rejects(() => addExpense({ ...base, kind: 'PETTY_CASH', workerName: 'Kasun' }), 'what the cash was for'),
      'petty cash must say what it was for');

    // -------------------------------------------------------- record some
    console.log('\n▶ Expenses, petty cash, salaries');
    const rent = await addExpense({ ...base, amount: 1000 }); // cash
    const bank = await addExpense({ ...base, amount: 700, paidVia: 'BANK' }); // bank → not in the drawer
    const wrong = await addExpense({ ...base, category: 'VERIFY Transport', amount: 500, paidVia: 'BANK' }); // will be voided
    const workerA = await prisma.worker.create({ data: { name: 'VERIFY Asha', monthlySalary: 20000, branchId: f.branch.id } });
    const workerB = await prisma.worker.create({ data: { name: 'VERIFY Bimal', monthlySalary: 10000, branchId: f.branch.id } });
    await addExpense({ kind: 'PETTY_CASH', amount: 300, date: today, workerId: workerA.id, description: 'Tea & snacks', branchId: f.branch.id, ...actor });
    const period = today.slice(0, 7);
    const pay = await paySalary({ workerId: workerA.id, period, base: 20000, bonus: 1000, deduction: 500, paidVia: 'CASH', date: today, ...actor });
    assert(pay.netPaid === 20500, 'salary 20,000 + bonus 1,000 − deduction 500 → Rs 20,500 paid out');
    const salExpense = await prisma.expense.findFirstOrThrow({ where: { salaryPaymentId: pay.id } });
    assert(salExpense.kind === 'SALARY' && salExpense.amount === 20500 && salExpense.workerId === workerA.id,
      'the salary also wrote one SALARY expense for the cash that left');
    assert(await rejects(() => paySalary({ workerId: workerA.id, period, base: 1, paidVia: 'CASH', date: today, ...actor }), 'bonus'),
      'paying more than the monthly salary again is rejected (use Bonus)');
    assert(await rejects(() => paySalary({ workerId: workerB.id, period, base: 100, deduction: 500, paidVia: 'CASH', date: today, ...actor }), 'deduction'),
      'a deduction bigger than the payment is rejected');

    // ---------------------------------------------------- voiding / audit
    console.log('\n▶ Voiding keeps the record');
    assert(await rejects(() => voidExpense({ id: wrong.id, reason: ' ', ...actor }), 'reason'), 'voiding needs a reason');
    await voidExpense({ id: wrong.id, reason: 'Entered twice', ...actor });
    const voided = await prisma.expense.findUniqueOrThrow({ where: { id: wrong.id } });
    assert(!!voided.voidedAt && voided.voidReason === 'Entered twice' && voided.voidedByName === 'Verifier',
      'voided row is kept with when, who and why');
    assert(await rejects(() => voidExpense({ id: wrong.id, reason: 'again please', ...actor }), 'already voided'), 'cannot void twice');
    assert(await rejects(() => voidExpense({ id: salExpense.id, reason: 'oops', ...actor }), 'salary payment'),
      'a salary expense is voided through its payment, not directly');

    const payB = await paySalary({ workerId: workerB.id, period, base: 10000, paidVia: 'CASH', date: today, ...actor });
    await voidSalaryPayment({ id: payB.id, reason: 'Wrong worker', ...actor });
    const bPay = await prisma.salaryPayment.findUniqueOrThrow({ where: { id: payB.id }, include: { expense: true } });
    assert(!!bPay.voidedAt && !!bPay.expense?.voidedAt, 'voiding a salary payment voids its expense in the same step');

    const audits = await prisma.auditLog.count({ where: { branchId: f.branch.id, entity: { in: ['EXPENSE', 'SALARY'] } } });
    assert(audits >= 8, `every create / void left an audit row (${audits})`);
    assert(rent.id !== bank.id, 'separate entries');

    // ----------------------------------------------------------- float
    console.log('\n▶ Till float');
    const t0 = new Date();
    await wait(30);
    assert(await rejects(() => setBranchFloat({ branchId: f.branch.id, amount: 5000, reason: '', ...actor }), 'reason'), 'a float change needs a reason');
    assert(await rejects(() => setBranchFloat({ branchId: f.branch.id, amount: -1, reason: 'bad value', ...actor }), 'negative'), 'a negative float is rejected');
    assert(await rejects(() => setBranchFloat({ branchId: f.branch.id, amount: 0, reason: 'same as now', ...actor }), 'already'), 'setting the same float is rejected');
    await setBranchFloat({ branchId: f.branch.id, amount: 5000, reason: 'Opening float', ...actor });
    await wait(30);
    const tMid = new Date();
    await wait(30);
    await setBranchFloat({ branchId: f.branch.id, amount: 3000, reason: 'Too much cash kept in the till', ...actor });
    const hist = await prisma.floatAdjustment.findMany({ where: { branchId: f.branch.id }, orderBy: { createdAt: 'asc' } });
    assert(hist.length === 2 && hist[0].oldAmount === 0 && hist[0].newAmount === 5000 && hist[0].delta === 5000,
      'first change logged 0 → 5,000 (+5,000)');
    assert(hist[1].oldAmount === 5000 && hist[1].newAmount === 3000 && hist[1].delta === -2000 && hist[1].reason.includes('Too much'),
      'second change logged 5,000 → 3,000 (−2,000) with its reason');
    assert((await floatAt(new Date(t0.getTime() - 1000), f.branch.id)) === 0, 'the float before any change was 0');
    assert((await floatAt(tMid, f.branch.id)) === 5000, 'between the two changes the float was 5,000');
    assert((await floatAt(new Date(Date.now() + 1000), f.branch.id)) === 3000, 'now the float is 3,000');

    // ----------------------------------------------------- the reports
    console.log('\n▶ Profit & loss with expenses');
    pl = await computeProfitLoss(range, f.branch.id);
    // active: rent 1,000 + bank 700 (general 1,700) + petty 300 + salary 20,500 ; voided 500 + 10,000 excluded
    assert(pl.expenses.general === 1700, `general expenses = 1,000 + 700 (voided 500 left out) = 1,700 (got ${pl.expenses.general})`);
    assert(pl.expenses.pettyCash === 300, `petty cash = 300 (got ${pl.expenses.pettyCash})`);
    assert(pl.expenses.salary === 20500, `salaries = 20,500 (voided 10,000 left out) (got ${pl.expenses.salary})`);
    assert(pl.expenses.total === 22500, `total expenses = 22,500 (got ${pl.expenses.total})`);
    assert(pl.netProfit === 14130 - 22500, `net profit = 14,130 − 22,500 = −8,370 (got ${pl.netProfit})`);
    assert(pl.marginPercent === -17.4, `margin = −17.4% of net sales (got ${pl.marginPercent})`);

    const profitBeforeFloat = pl.netProfit;
    await setBranchFloat({ branchId: f.branch.id, amount: 9000, reason: 'Float must not touch profit', ...actor });
    pl = await computeProfitLoss(range, f.branch.id);
    assert(pl.netProfit === profitBeforeFloat, 'changing the float does not change profit');

    console.log('\n▶ Back-dated entries land on their own day');
    await addExpense({ ...base, amount: 111, date: yesterday });
    const todayOnly = await computeProfitLoss(range, f.branch.id);
    assert(todayOnly.expenses.total === 22500, "yesterday's expense is not in today's report");
    const both = await computeProfitLoss({ from: startOfDay(new Date(Date.now() - 24 * 3600 * 1000)), to: endOfDay(new Date()) }, f.branch.id);
    assert(both.expenses.total === 22611, `a range covering both days includes it (got ${both.expenses.total})`);
    const created = await prisma.expense.findFirstOrThrow({ where: { branchId: f.branch.id, amount: 111 } });
    assert(todayStr(created.createdAt) === today && todayStr(created.expenseDate) === yesterday,
      'it records BOTH the business date (yesterday) and the real entry time (now)');

    console.log('\n▶ Cash drawer');
    await setBranchFloat({ branchId: f.branch.id, amount: 3000, reason: 'Back to normal float', ...actor });
    const drawer = await computeCashDrawer(range, f.branch.id);
    assert(drawer.float === 3000, `float in force = 3,000 (got ${drawer.float})`);
    assert(drawer.cashSales === 43080, `cash sales = 720+42,000+360 = 43,080 (got ${drawer.cashSales})`);
    assert(drawer.cashSettlements === 400, `cash credit payments = 400 (got ${drawer.cashSettlements})`);
    assert(drawer.cashOut === 21800, `cash out = rent 1,000 + petty 300 + salary 20,500 = 21,800 (bank expense & voided left out) (got ${drawer.cashOut})`);
    assert(drawer.expected === 3000 + 43480 - 21800, `expected in drawer = 3,000 + 43,480 − 21,800 = 24,680 (got ${drawer.expected})`);
  } finally {
    console.log('\n▶ Cleanup');
    await f.teardown();
  }

  const bad = failureCount();
  console.log(bad === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${bad} CHECK(S) FAILED\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
