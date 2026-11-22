import { requireModule, hasModule, canSeeCost } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { startOfDay, endOfDay, startOfMonth, todayStr } from '@/lib/dates';
import { salesSummary, computeProfitLoss } from '@/lib/reports';
import { receivablesByCustomer } from '@/lib/receivables';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import AppShell from '@/components/AppShell';
import OverviewView from '@/components/accounting/OverviewView';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

// Accounting › Overview: today at a glance. Takings use lib/reports.salesSummary
// (the same definition as Accounting › Sales). Profit and what-is-owed are only
// loaded for people who may already see them elsewhere.
export default async function OverviewPage() {
  const session = await requireModule('reports');
  const [shell, scope, showProfit, showDue, canProducts, canStock] = await Promise.all([
    getShellProps(session),
    getActiveScope(session),
    canSeeCost(session),
    hasModule(session, 'customers'),
    hasModule(session, 'products'),
    hasModule(session, 'stock'),
  ]);
  const allBranches = scope === ALL_BRANCHES;
  const branchId = allBranches ? null : scope;

  const now = new Date();
  const todayFrom = startOfDay(now);
  const yesterday = { from: new Date(todayFrom.getTime() - DAY_MS), to: new Date(todayFrom.getTime() - 1) };
  const fortnightFrom = new Date(todayFrom.getTime() - 13 * DAY_MS);
  const monthRange = { from: startOfMonth(now), to: endOfDay(now) };

  const [store, today, yest, month, recent, stockRows, dueRows, pnl] = await Promise.all([
    prisma.store.findFirst({ select: { currency: true } }),
    salesSummary({ from: todayFrom }, branchId),
    salesSummary(yesterday, branchId),
    salesSummary({ from: monthRange.from }, branchId),
    prisma.sale.findMany({
      where: { voidedAt: null, createdAt: { gte: fortnightFrom }, ...(branchId ? { branchId } : {}) },
      select: { createdAt: true, total: true },
    }),
    prisma.branchStock.findMany({
      where: { product: { active: true }, ...(branchId ? { branchId } : {}) },
      select: {
        stock: true,
        lowStockAt: true,
        branch: { select: { name: true } },
        product: { select: { name: true } },
      },
    }),
    showDue ? receivablesByCustomer({ branchId }) : Promise.resolve([]),
    showProfit ? computeProfitLoss(monthRange, branchId) : Promise.resolve(null),
  ]);

  // Daily takings for the last 14 days, oldest first (day keys are Sri Lanka dates).
  const byDay = new Map<string, number>();
  for (const s of recent) {
    const k = todayStr(s.createdAt);
    byDay.set(k, (byDay.get(k) ?? 0) + s.total);
  }
  const days = Array.from({ length: 14 }, (_, i) => {
    const key = todayStr(new Date(fortnightFrom.getTime() + i * DAY_MS));
    return { key, total: byDay.get(key) ?? 0 };
  });

  const lowAll = stockRows
    .filter((r) => r.stock <= r.lowStockAt)
    .sort((a, b) => a.stock - b.stock || a.product.name.localeCompare(b.product.name));
  const lowStock = lowAll.slice(0, 8).map((r) => ({
    name: r.product.name,
    branch: allBranches ? r.branch.name : null,
    stock: r.stock,
  }));

  return (
    <AppShell {...shell} wide>
      <OverviewView
        currency={store?.currency ?? 'Rs'}
        scopeLabel={shell.activeBranchName}
        dateLabel={todayStr(now)}
        today={{ takings: today.takings, count: today.count }}
        yesterdayTakings={yest.takings}
        month={{ takings: month.takings, count: month.count }}
        days={days}
        lowStock={lowStock}
        lowStockTotal={lowAll.length}
        owed={showDue ? { total: dueRows.reduce((s, r) => s + r.due, 0), customers: dueRows.length, top: dueRows.slice(0, 5).map((r) => ({ name: r.name, due: r.due })) } : null}
        monthProfit={pnl ? pnl.netProfit : null}
        links={{ products: canProducts || canStock, receivables: showDue, profit: showProfit }}
      />
    </AppShell>
  );
}
