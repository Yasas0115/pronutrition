// Profit & loss and cash-drawer calculations. Server-only (uses Prisma) and kept
// out of the page so it can be exercised directly in tests.
//
// Definitions (all money is whole rupees):
//   Net sales     = Σ(subtotal − discount) of sales in the period, tax excluded
//                   (tax is collected for the government, not earned).
//   COGS          = Σ qty × the buying price frozen on each sale line. Sales made
//                   before cost snapshots existed fall back to the product's
//                   current buying price and are counted as "estimated".
//   Gross profit  = Net sales − COGS.
//   Expenses      = non-voided Expense rows dated in the period (general +
//                   salary).
//   Net profit    = Gross profit − Expenses.
//   The till float is NOT in here — it is cash on hand, not income or expense.
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { todayStr } from './dates';

export type DateRange = { from: Date; to: Date };

export type SaleTypeKey = 'RETAIL' | 'WHOLESALE';

export type SaleTypePnl = {
  count: number;
  gross: number; // Σ subtotal (before discounts)
  discounts: number;
  net: number; // gross − discounts
  tax: number;
  cogs: number;
  grossProfit: number; // net − cogs
};

export type ProfitLoss = {
  sales: SaleTypePnl; // both types combined
  byType: Record<SaleTypeKey, SaleTypePnl>;
  /** Sale lines priced from today's buying price because no snapshot exists. */
  estimatedLines: number;
  /** Sale lines with no snapshot and a product that no longer exists (counted at 0). */
  unknownLines: number;
  expenses: {
    general: number;
    salary: number;
    total: number;
    lines: { kind: string; category: string; amount: number; count: number }[];
  };
  grossProfit: number;
  netProfit: number;
  /** Net profit as a % of net sales (0 when there were no sales). */
  marginPercent: number;
};

const SALE_TYPES: SaleTypeKey[] = ['RETAIL', 'WHOLESALE'];

// Either end may be left open (today = from only, all time = no range at all).
export type OpenRange = { from?: Date; to?: Date } | null;

function saleWhere(range: OpenRange, branchId: string | null): Prisma.SaleWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (range?.from) createdAt.gte = range.from;
  if (range?.to) createdAt.lte = range.to;
  return {
    ...(range?.from || range?.to ? { createdAt } : {}),
    ...(branchId ? { branchId } : {}),
  };
}

// ----------------------------------------------------------- sales summary
export type SalesSummary = {
  count: number;
  gross: number; // Σ subtotal, before discounts
  discounts: number;
  net: number; // gross − discounts (tax excluded) — what profit is measured on
  tax: number;
  takings: number; // Σ total = net + tax — what went through the till
};

/**
 * The single definition of "sales" for a period. Net sales is what P&L uses;
 * takings is net + tax, i.e. what the customers were actually charged. Both come
 * from here so the Sales page and the P&L can never show different figures.
 */
export async function salesSummary(
  range: OpenRange,
  branchId: string | null,
  saleType?: SaleTypeKey,
): Promise<SalesSummary> {
  const agg = await prisma.sale.aggregate({
    where: { ...saleWhere(range, branchId), ...(saleType ? { saleType } : {}) },
    _sum: { subtotal: true, discount: true, tax: true, total: true },
    _count: true,
  });
  const gross = agg._sum.subtotal ?? 0;
  const discounts = agg._sum.discount ?? 0;
  return {
    count: agg._count,
    gross,
    discounts,
    net: gross - discounts,
    tax: agg._sum.tax ?? 0,
    takings: agg._sum.total ?? 0,
  };
}

export type SalesMixRow = { method: string; saleType: string; count: number; total: number; due: number };

/** Sales rolled up by payment method × sale type (what was taken, what is still owed). */
export async function salesMix(range: OpenRange, branchId: string | null): Promise<SalesMixRow[]> {
  const rows = await prisma.sale.groupBy({
    by: ['method', 'saleType'],
    where: saleWhere(range, branchId),
    _sum: { total: true, balanceDue: true },
    _count: true,
  });
  return rows.map((r) => ({
    method: r.method,
    saleType: r.saleType,
    count: r._count,
    total: r._sum.total ?? 0,
    due: r._sum.balanceDue ?? 0,
  }));
}

function expenseWhere(range: DateRange, branchId: string | null): Prisma.ExpenseWhereInput {
  return { voidedAt: null, expenseDate: { gte: range.from, lte: range.to }, ...(branchId ? { branchId } : {}) };
}

export async function computeProfitLoss(range: DateRange, branchId: string | null): Promise<ProfitLoss> {
  const base = saleWhere(range, branchId);

  // Buying price for sale lines that have no snapshot (sold before Phase 1).
  const fallback = await prisma.saleItem.groupBy({
    by: ['productId'],
    where: { unitCost: null, sale: base },
    _sum: { qty: true },
    _count: true,
  });
  const fallbackIds = fallback.map((f) => f.productId).filter((id): id is string => !!id);
  const products = fallbackIds.length
    ? await prisma.product.findMany({ where: { id: { in: fallbackIds } }, select: { id: true, cost: true } })
    : [];
  const costOf = new Map(products.map((p) => [p.id, p.cost]));

  let estimatedLines = 0;
  let unknownLines = 0;

  const byType = {} as Record<SaleTypeKey, SaleTypePnl>;
  for (const type of SALE_TYPES) {
    const where: Prisma.SaleWhereInput = { ...base, saleType: type };
    const summary = await salesSummary(range, branchId, type);

    // Lines with a snapshot: group by (cost, product) and multiply in JS — Prisma
    // can't SUM(qty * unitCost) itself.
    const known = await prisma.saleItem.groupBy({
      by: ['unitCost'],
      where: { unitCost: { not: null }, sale: where },
      _sum: { qty: true },
    });
    let cogs = known.reduce((n, r) => n + (r.unitCost ?? 0) * (r._sum.qty ?? 0), 0);

    const noSnapshot = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: { unitCost: null, sale: where },
      _sum: { qty: true },
      _count: true,
    });
    for (const r of noSnapshot) {
      const cost = r.productId ? costOf.get(r.productId) : undefined;
      if (cost === undefined) {
        unknownLines += r._count;
      } else {
        estimatedLines += r._count;
        cogs += cost * (r._sum.qty ?? 0);
      }
    }

    byType[type] = {
      count: summary.count,
      gross: summary.gross,
      discounts: summary.discounts,
      net: summary.net,
      tax: summary.tax,
      cogs,
      grossProfit: summary.net - cogs,
    };
  }

  const sum = (f: (t: SaleTypePnl) => number) => SALE_TYPES.reduce((n, k) => n + f(byType[k]), 0);
  const sales: SaleTypePnl = {
    count: sum((t) => t.count),
    gross: sum((t) => t.gross),
    discounts: sum((t) => t.discounts),
    net: sum((t) => t.net),
    tax: sum((t) => t.tax),
    cogs: sum((t) => t.cogs),
    grossProfit: sum((t) => t.grossProfit),
  };

  const rows = await prisma.expense.groupBy({
    by: ['kind', 'category'],
    where: expenseWhere(range, branchId),
    _sum: { amount: true },
    _count: true,
  });
  const lines = rows
    .map((r) => ({ kind: r.kind, category: r.category, amount: r._sum.amount ?? 0, count: r._count }))
    .sort((a, b) => b.amount - a.amount);
  const ofKind = (k: string) => lines.filter((l) => l.kind === k).reduce((n, l) => n + l.amount, 0);
  const expenses = {
    general: ofKind('GENERAL'),
    salary: ofKind('SALARY'),
    total: lines.reduce((n, l) => n + l.amount, 0),
    lines,
  };

  const netProfit = sales.grossProfit - expenses.total;
  return {
    sales,
    byType,
    estimatedLines,
    unknownLines,
    expenses,
    grossProfit: sales.grossProfit,
    netProfit,
    marginPercent: sales.net > 0 ? Math.round((netProfit / sales.net) * 1000) / 10 : 0,
  };
}

// ------------------------------------------------------------------- float
/**
 * The till float that applied at a moment in time, summed over one branch or all
 * of them. Replays FloatAdjustment history: the last change at or before `at`
 * wins; before the first change it was whatever that change started from.
 */
export async function floatAt(at: Date, branchId: string | null): Promise<number> {
  const branches = await prisma.branch.findMany({
    where: branchId ? { id: branchId } : undefined,
    select: { id: true, floatAmount: true },
  });
  const adjustments = await prisma.floatAdjustment.findMany({
    where: branchId ? { branchId } : undefined,
    orderBy: { createdAt: 'asc' },
    select: { branchId: true, oldAmount: true, newAmount: true, createdAt: true },
  });

  let total = 0;
  for (const b of branches) {
    const mine = adjustments.filter((a) => a.branchId === b.id);
    if (mine.length === 0) {
      total += b.floatAmount;
      continue;
    }
    let value = mine[0].oldAmount;
    for (const a of mine) {
      if (a.createdAt.getTime() <= at.getTime()) value = a.newAmount;
      else break;
    }
    total += value;
  }
  return total;
}

// ------------------------------------------------------------ cash drawer
export type CashDrawer = {
  float: number; // float in force at the end of the period
  cashSales: number; // cash taken at the till for sales
  cashSettlements: number; // cash received against credit
  cashIn: number;
  cashExpenses: number; // general expenses paid in cash
  cashSalaries: number;
  cashOut: number;
  expected: number; // float + cashIn − cashOut
};

/**
 * What should physically be in the drawer: the float plus the cash that came in
 * (sales and credit payments received in cash) minus the cash that went out
 * (expenses, and salaries paid in cash) over the period. Card and
 * bank money is not in the drawer, so it is left out on both sides.
 */
export async function computeCashDrawer(range: DateRange, branchId: string | null): Promise<CashDrawer> {
  const [paid, out, float] = await Promise.all([
    prisma.salePayment.groupBy({
      by: ['kind'],
      where: {
        method: 'CASH',
        createdAt: { gte: range.from, lte: range.to },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ['kind'],
      where: { ...expenseWhere(range, branchId), paidVia: 'CASH' },
      _sum: { amount: true },
    }),
    floatAt(range.to, branchId),
  ]);

  const inOf = (k: string) => paid.find((p) => p.kind === k)?._sum.amount ?? 0;
  const outOf = (k: string) => out.find((o) => o.kind === k)?._sum.amount ?? 0;

  const cashSales = inOf('SALE');
  const cashSettlements = inOf('SETTLEMENT');
  const cashExpenses = outOf('GENERAL');
  const cashSalaries = outOf('SALARY');
  const cashIn = cashSales + cashSettlements;
  const cashOut = cashExpenses + cashSalaries;

  return {
    float,
    cashSales,
    cashSettlements,
    cashIn,
    cashExpenses,
    cashSalaries,
    cashOut,
    expected: float + cashIn - cashOut,
  };
}

// -------------------------------------------------------------- trend report
export type TrendGranularity = 'day' | 'week' | 'month';

export type TrendBucket = {
  key: string; // YYYY-MM-DD (day, or the Monday of the week) or YYYY-MM
  net: number; // net sales (tax excluded)
  cogs: number;
  grossProfit: number;
  expenses: number;
  expenseLines: { category: string; amount: number }[]; // by name, biggest first
  netProfit: number; // grossProfit − expenses (the till float is never in here)
  creditGiven: number; // sold on credit in the bucket and not paid at the till
  creditCollected: number; // credit payments received in the bucket
};

export type Trend = Record<TrendGranularity, TrendBucket[]>;

const dayMs = 86_400_000;

// Monday of the week containing a YYYY-MM-DD day.
function weekStart(ymd: string): string {
  const t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
  const back = (new Date(t).getUTCDay() + 6) % 7; // Mon = 0
  return new Date(t - back * dayMs).toISOString().slice(0, 10);
}

const keyOf: Record<TrendGranularity, (ymd: string) => string> = {
  day: (d) => d,
  week: weekStart,
  month: (d) => d.slice(0, 7),
};

/**
 * Day-by-day, week-by-week and month-by-month figures for a range, using the
 * same definitions as the P&L: net sales − cost of goods − expenses. Credit is
 * shown beside profit, not inside it: `creditGiven` is what customers took away
 * unpaid, `creditCollected` what came back in. Every bucket in the range is
 * present (quiet days are zeros) so a chart has no gaps.
 */
export async function computeTrend(range: DateRange, branchId: string | null): Promise<Trend> {
  const [sales, payments, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere(range, branchId),
      select: {
        id: true,
        createdAt: true,
        subtotal: true,
        discount: true,
        total: true,
        items: { select: { qty: true, unitCost: true, productId: true } },
      },
    }),
    prisma.salePayment.findMany({
      where: { createdAt: { gte: range.from, lte: range.to }, ...(branchId ? { branchId } : {}) },
      select: { saleId: true, createdAt: true, amount: true, kind: true },
    }),
    prisma.expense.findMany({
      where: expenseWhere(range, branchId),
      select: { expenseDate: true, category: true, amount: true },
    }),
  ]);

  // Buying price for old lines that have no snapshot (same fallback as the P&L).
  const needCost = new Set<string>();
  for (const s of sales) for (const i of s.items) if (i.unitCost == null && i.productId) needCost.add(i.productId);
  const products = needCost.size
    ? await prisma.product.findMany({ where: { id: { in: [...needCost] } }, select: { id: true, cost: true } })
    : [];
  const costOf = new Map(products.map((p) => [p.id, p.cost]));

  const atSale = new Map<string, number>(); // saleId → paid at the till
  for (const p of payments) if (p.kind === 'SALE') atSale.set(p.saleId, (atSale.get(p.saleId) ?? 0) + p.amount);

  type Acc = TrendBucket & { cats: Map<string, number> };
  const result = {} as Trend;
  const startKey = todayStr(range.from);
  const endKey = todayStr(range.to);

  for (const g of ['day', 'week', 'month'] as TrendGranularity[]) {
    const bucketOf = keyOf[g];
    const buckets = new Map<string, Acc>();
    const get = (key: string): Acc => {
      let b = buckets.get(key);
      if (!b) {
        b = { key, net: 0, cogs: 0, grossProfit: 0, expenses: 0, expenseLines: [], netProfit: 0, creditGiven: 0, creditCollected: 0, cats: new Map() };
        buckets.set(key, b);
      }
      return b;
    };
    // Pre-create every bucket in the range so quiet periods show as zero.
    const startMs = Date.UTC(+startKey.slice(0, 4), +startKey.slice(5, 7) - 1, +startKey.slice(8, 10));
    const endMs = Date.UTC(+endKey.slice(0, 4), +endKey.slice(5, 7) - 1, +endKey.slice(8, 10));
    for (let t = startMs; t <= endMs; t += dayMs) get(bucketOf(new Date(t).toISOString().slice(0, 10)));

    for (const s of sales) {
      const b = get(bucketOf(todayStr(s.createdAt)));
      b.net += s.subtotal - s.discount;
      for (const i of s.items) b.cogs += (i.unitCost ?? (i.productId ? costOf.get(i.productId) ?? 0 : 0)) * i.qty;
      b.creditGiven += Math.max(0, s.total - (atSale.get(s.id) ?? 0));
    }
    for (const p of payments) {
      if (p.kind === 'SETTLEMENT') get(bucketOf(todayStr(p.createdAt))).creditCollected += p.amount;
    }
    for (const e of expenses) {
      const b = get(bucketOf(todayStr(e.expenseDate)));
      b.expenses += e.amount;
      b.cats.set(e.category, (b.cats.get(e.category) ?? 0) + e.amount);
    }

    result[g] = [...buckets.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(({ cats, ...b }) => ({
        ...b,
        grossProfit: b.net - b.cogs,
        netProfit: b.net - b.cogs - b.expenses,
        expenseLines: [...cats.entries()].map(([category, amount]) => ({ category, amount })).sort((x, y) => y.amount - x.amount),
      }));
  }
  return result;
}
