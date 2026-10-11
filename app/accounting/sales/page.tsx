import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { startOfDay, startOfMonth } from '@/lib/dates';
import { salesSummary, salesMix } from '@/lib/reports';
import { methodLabels } from '@/lib/payment-methods';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import AppShell from '@/components/AppShell';
import SalesView, { type MixRow } from '@/components/accounting/SalesView';

export const dynamic = 'force-dynamic';

// Accounting › Sales: takings, best sellers, receipts and the sales mix. The
// totals come from lib/reports.salesSummary — the same definition Profit & Cash
// uses, so the two pages can never disagree.
export default async function SalesPage() {
  const session = await requireModule('reports');
  const shell = await getShellProps(session);
  const scope = await getActiveScope(session);
  const allBranches = scope === ALL_BRANCHES;
  const branchId = allBranches ? null : scope;

  const branchWhere = branchId ? { branchId } : {};
  const itemBranchWhere = branchId ? { sale: { branchId } } : {};

  const now = new Date();
  const today = { from: startOfDay(now) };
  const month = { from: startOfMonth(now) };

  const [store, todaySum, monthSum, allSum, topRaw, recent, byBranch, mixToday, mixMonth, mixAll, labels] =
    await Promise.all([
      prisma.store.findFirst({ select: { currency: true, name: true, phone: true, address: true, receiptNote: true } }),
      salesSummary(today, branchId),
      salesSummary(month, branchId),
      salesSummary(null, branchId),
      prisma.saleItem.groupBy({
        by: ['name'],
        where: itemBranchWhere,
        _sum: { qty: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 8,
      }),
      prisma.sale.findMany({ where: branchWhere, orderBy: { createdAt: 'desc' }, take: 50, include: { items: true } }),
      prisma.sale.groupBy({ by: ['branchId'], _sum: { total: true }, _count: true }),
      salesMix(today, branchId),
      salesMix(month, branchId),
      salesMix(null, branchId),
      methodLabels(prisma),
    ]);

  const stats = {
    today: { takings: todaySum.takings, net: todaySum.net, count: todaySum.count },
    month: { takings: monthSum.takings, net: monthSum.net, count: monthSum.count },
    all: { takings: allSum.takings, net: allSum.net, count: allSum.count },
  };

  const topProducts = topRaw.map((t) => ({ name: t.name, qty: t._sum.qty ?? 0, revenue: t._sum.lineTotal ?? 0 }));

  const sales = recent.map((s) => ({
    id: s.id,
    number: s.number,
    createdAt: s.createdAt.toISOString(),
    branchName: s.branchName,
    subtotal: s.subtotal,
    discount: s.discount,
    methodDiscount: s.methodDiscount,
    manualDiscount: s.manualDiscount,
    tax: s.tax,
    total: s.total,
    paid: s.paid,
    change: s.change,
    balanceDue: s.balanceDue,
    saleType: (s.saleType === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL') as 'RETAIL' | 'WHOLESALE',
    method: s.method,
    customerName: s.customerName,
    cashierName: s.cashierName,
    items: s.items.map((i) => ({ name: i.name, price: i.price, qty: i.qty, lineTotal: i.lineTotal })),
  }));

  // Per-branch takings roll-up (shown on the "All branches" view).
  const branchNames = new Map(shell.branches.map((b) => [b.id, b.name]));
  const branchBreakdown = byBranch
    .map((b) => ({
      name: b.branchId ? branchNames.get(b.branchId) ?? 'Unknown' : 'Unassigned',
      revenue: b._sum.total ?? 0,
      count: b._count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const tag = (period: MixRow['period'], rows: Awaited<ReturnType<typeof salesMix>>): MixRow[] =>
    rows.map((r) => ({ period, ...r }));
  const mix: MixRow[] = [...tag('today', mixToday), ...tag('month', mixMonth), ...tag('all', mixAll)];

  return (
    <AppShell {...shell} wide>
      <SalesView
        stats={stats}
        topProducts={topProducts}
        sales={sales}
        branchBreakdown={branchBreakdown}
        mix={mix}
        methodLabels={labels}
        showBranchColumn={allBranches}
        scopeLabel={shell.activeBranchName}
        currency={store?.currency ?? 'Rs'}
        store={{
          name: store?.name ?? 'Pro Nutrition',
          phone: store?.phone ?? null,
          address: store?.address ?? null,
          note: store?.receiptNote ?? null,
        }}
      />
    </AppShell>
  );
}
