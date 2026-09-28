import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { startOfDay } from '@/lib/dates';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import AppShell from '@/components/AppShell';
import SalesView from '@/components/SalesView';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const session = await requireModule('reports');
  const shell = await getShellProps(session);
  const scope = await getActiveScope(session);
  const allBranches = scope === ALL_BRANCHES;

  // Branch filter applied to every query (empty = all branches).
  const branchWhere = allBranches ? {} : { branchId: scope };
  const itemBranchWhere = allBranches ? {} : { sale: { branchId: scope } };

  const now = new Date();
  const dayStart = startOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [store, todayAgg, monthAgg, allAgg, topRaw, recent, byBranch] = await Promise.all([
    prisma.store.findFirst({ select: { currency: true, name: true } }),
    prisma.sale.aggregate({ _sum: { total: true }, _count: true, where: { ...branchWhere, createdAt: { gte: dayStart } } }),
    prisma.sale.aggregate({ _sum: { total: true }, _count: true, where: { ...branchWhere, createdAt: { gte: monthStart } } }),
    prisma.sale.aggregate({ _sum: { total: true }, _count: true, where: branchWhere }),
    prisma.saleItem.groupBy({
      by: ['name'],
      where: itemBranchWhere,
      _sum: { qty: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 8,
    }),
    prisma.sale.findMany({ where: branchWhere, orderBy: { createdAt: 'desc' }, take: 50, include: { items: true } }),
    prisma.sale.groupBy({ by: ['branchId'], _sum: { total: true }, _count: true }),
  ]);

  const stats = {
    todayRevenue: todayAgg._sum.total ?? 0,
    todayCount: todayAgg._count,
    monthRevenue: monthAgg._sum.total ?? 0,
    monthCount: monthAgg._count,
    totalRevenue: allAgg._sum.total ?? 0,
    totalCount: allAgg._count,
  };

  const topProducts = topRaw.map((t) => ({ name: t.name, qty: t._sum.qty ?? 0, revenue: t._sum.lineTotal ?? 0 }));

  const sales = recent.map((s) => ({
    id: s.id,
    number: s.number,
    createdAt: s.createdAt.toISOString(),
    total: s.total,
    subtotal: s.subtotal,
    discount: s.discount,
    tax: s.tax,
    paid: s.paid,
    change: s.change,
    method: s.method,
    branchName: s.branchName,
    customerName: s.customerName,
    cashierName: s.cashierName,
    items: s.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, lineTotal: i.lineTotal })),
  }));

  // Per-branch revenue roll-up (shown on the "All branches" view).
  const branchNames = new Map(shell.branches.map((b) => [b.id, b.name]));
  const branchBreakdown = byBranch
    .map((b) => ({
      name: b.branchId ? branchNames.get(b.branchId) ?? 'Unknown' : 'Unassigned',
      revenue: b._sum.total ?? 0,
      count: b._count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <AppShell {...shell}>
      <SalesView
        stats={stats}
        topProducts={topProducts}
        sales={sales}
        branchBreakdown={branchBreakdown}
        showBranchColumn={allBranches}
        scopeLabel={shell.activeBranchName}
        currency={store?.currency ?? 'Rs'}
        storeName={store?.name ?? 'Pro Nutrition'}
      />
    </AppShell>
  );
}
