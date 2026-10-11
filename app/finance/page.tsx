import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import { startOfDay, endOfDay, startOfMonth, parseDay, monthKey, monthRange, todayStr } from '@/lib/dates';
import { computeProfitLoss, computeCashDrawer } from '@/lib/reports';
import AppShell from '@/components/AppShell';
import FinanceView from '@/components/FinanceView';
import type { ExpenseRow, WorkerRow, SalaryRow, FloatRow, FloatHistoryRow } from '@/components/finance/types';

export const dynamic = 'force-dynamic';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Profit & expenses for owners and accountants: profit & loss over any date
// range, expenses, worker salaries, petty cash, the till float and the cash
// drawer. Gated by the `finance` module, like Accounts.
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; month?: string }>;
}) {
  const session = await requireModule('finance');
  const params = await searchParams;
  const shell = await getShellProps(session);
  const scope = await getActiveScope(session);
  const allBranches = scope === ALL_BRANCHES;
  const branchId = allBranches ? null : scope;

  // ---- date range (Sri Lanka days, inclusive) ----
  const now = new Date();
  let fromDay = parseDay(params.from ?? '') ?? startOfMonth(now);
  let toDay = parseDay(params.to ?? '') ?? startOfDay(now);
  if (fromDay.getTime() > toDay.getTime()) [fromDay, toDay] = [toDay, fromDay];
  const range = { from: fromDay, to: endOfDay(toDay) };

  // ---- salary month ----
  const month = monthRange(params.month ?? '') ? (params.month as string) : monthKey(now);
  // Last 12 salary months, built from the YYYY-MM key itself (not from a Date) so
  // the UTC / Sri Lanka month boundary can never shift the list by one.
  const [curY, curM] = monthKey(now).split('-').map(Number);
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const idx = curY * 12 + (curM - 1) - i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const value = `${y}-${String(m).padStart(2, '0')}`;
    const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-LK', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return { value, label };
  });
  if (!monthOptions.some((m) => m.value === month)) {
    monthOptions.push({ value: month, label: month });
  }

  const branchScope = branchId ? { branchId } : {};
  const expenseWhere = { expenseDate: { gte: range.from, lte: range.to }, ...branchScope };

  const [store, profit, drawer, expenses, petty, categories, workers, salaryPayments, branchRows, floatHistory] =
    await Promise.all([
      prisma.store.findFirst({ select: { currency: true, name: true } }),
      computeProfitLoss(range, branchId),
      computeCashDrawer(range, branchId),
      prisma.expense.findMany({
        where: { ...expenseWhere, kind: 'GENERAL' },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      prisma.expense.findMany({
        where: { ...expenseWhere, kind: 'PETTY_CASH' },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      prisma.expenseCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.worker.findMany({
        where: branchId ? { OR: [{ branchId }, { branchId: null }] } : undefined,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      prisma.salaryPayment.findMany({
        where: { period: month, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}) },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.branch.findMany({
        where: branchId ? { id: branchId } : undefined,
        orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, active: true, floatAmount: true },
      }),
      prisma.floatAdjustment.findMany({
        where: branchId ? { branchId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

  const branchName = new Map(shell.branches.map((b) => [b.id, b.name]));

  const toExpense = (e: (typeof expenses)[number]): ExpenseRow => ({
    id: e.id,
    kind: e.kind,
    category: e.category,
    amount: e.amount,
    description: e.description,
    paidVia: e.paidVia,
    expenseDate: e.expenseDate.toISOString(),
    workerName: e.workerName,
    branchName: e.branchName,
    userName: e.userName,
    createdAt: e.createdAt.toISOString(),
    voidedAt: iso(e.voidedAt),
    voidedByName: e.voidedByName,
    voidReason: e.voidReason,
  });

  const paidBy = new Map<string, { base: number; bonus: number; deduction: number; net: number }>();
  for (const p of salaryPayments) {
    if (p.voidedAt || !p.workerId) continue;
    const cur = paidBy.get(p.workerId) ?? { base: 0, bonus: 0, deduction: 0, net: 0 };
    cur.base += p.baseAmount;
    cur.bonus += p.bonus;
    cur.deduction += p.deduction;
    cur.net += p.netPaid;
    paidBy.set(p.workerId, cur);
  }

  const workerRows: WorkerRow[] = workers.map((w) => {
    const p = paidBy.get(w.id);
    return {
      id: w.id,
      name: w.name,
      title: w.title,
      phone: w.phone,
      branchId: w.branchId,
      branchName: w.branchId ? branchName.get(w.branchId) ?? null : null,
      monthlySalary: w.monthlySalary,
      active: w.active,
      paidBase: p?.base ?? 0,
      paidBonus: p?.bonus ?? 0,
      paidDeduction: p?.deduction ?? 0,
      paidNet: p?.net ?? 0,
    };
  });

  const salaryRows: SalaryRow[] = salaryPayments.map((p) => ({
    id: p.id,
    workerName: p.workerName,
    period: p.period,
    baseAmount: p.baseAmount,
    bonus: p.bonus,
    deduction: p.deduction,
    netPaid: p.netPaid,
    paidVia: p.paidVia,
    paidAt: p.paidAt.toISOString(),
    note: p.note,
    userName: p.userName,
    createdAt: p.createdAt.toISOString(),
    voidedAt: iso(p.voidedAt),
    voidReason: p.voidReason,
  }));

  const lastChange = new Map<string, Date>();
  for (const h of floatHistory) if (!lastChange.has(h.branchId)) lastChange.set(h.branchId, h.createdAt);
  const floats: FloatRow[] = branchRows.map((b) => ({
    branchId: b.id,
    branchName: b.name,
    active: b.active,
    amount: b.floatAmount,
    lastChangedAt: iso(lastChange.get(b.id) ?? null),
  }));
  const floatHistoryRows: FloatHistoryRow[] = floatHistory.map((h) => ({
    id: h.id,
    branchName: h.branchName,
    oldAmount: h.oldAmount,
    newAmount: h.newAmount,
    delta: h.delta,
    reason: h.reason,
    userName: h.userName,
    createdAt: h.createdAt.toISOString(),
  }));

  return (
    <AppShell {...shell} wide>
      <FinanceView
        data={{
          currency: store?.currency ?? 'Rs',
          storeName: store?.name ?? 'Pro Nutrition',
          scopeLabel: shell.activeBranchName,
          allBranches,
          scopeBranchId: branchId,
          fromStr: todayStr(fromDay),
          toStr: todayStr(toDay),
          month,
          monthOptions,
          isOwner: session.role === 'OWNER',
          pinnedBranchId: session.role !== 'OWNER' ? session.branchId : null,
          branches: shell.branches.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name })),
          categories: categories.map((c) => ({ id: c.id, name: c.name })),
          profit,
          drawer,
          expenses: expenses.map(toExpense),
          petty: petty.map(toExpense),
          workers: workerRows,
          salaries: salaryRows,
          floats,
          floatHistory: floatHistoryRows,
        }}
      />
    </AppShell>
  );
}
