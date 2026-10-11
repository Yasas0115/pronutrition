import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import { resolveRange, todayStr } from '@/lib/dates';
import { computeProfitLoss, computeCashDrawer } from '@/lib/reports';
import AppShell from '@/components/AppShell';
import ProfitCashView from '@/components/accounting/ProfitCashView';
import type { FloatRow, FloatHistoryRow } from '@/components/finance/types';

export const dynamic = 'force-dynamic';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Accounting › Profit & Cash: profit & loss over any date range, the cash that
// should be in the drawer, and the till float behind it. Gated by `finance`.
export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireModule('finance');
  const params = await searchParams;
  const shell = await getShellProps(session);
  const scope = await getActiveScope(session);
  const allBranches = scope === ALL_BRANCHES;
  const branchId = allBranches ? null : scope;

  const { fromDay, toDay, range } = resolveRange(params.from, params.to);

  const [store, profit, drawer, branchRows, floatHistory] = await Promise.all([
    prisma.store.findFirst({ select: { currency: true, name: true } }),
    computeProfitLoss(range, branchId),
    computeCashDrawer(range, branchId),
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
      <ProfitCashView
        data={{
          currency: store?.currency ?? 'Rs',
          storeName: store?.name ?? 'Pro Nutrition',
          scopeLabel: shell.activeBranchName,
          allBranches,
          scopeBranchId: branchId,
          fromStr: todayStr(fromDay),
          toStr: todayStr(toDay),
          isOwner: session.role === 'OWNER',
          pinnedBranchId: session.role !== 'OWNER' ? session.branchId : null,
          branches: shell.branches.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name })),
          profit,
          drawer,
          floats,
          floatHistory: floatHistoryRows,
        }}
      />
    </AppShell>
  );
}
