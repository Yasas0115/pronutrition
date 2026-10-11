import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import AppShell from '@/components/AppShell';
import AccountsView, { type ValuationRow, type AuditRow } from '@/components/AccountsView';
import type { PriceHistoryRow } from '@/components/PriceHistoryTable';

export const dynamic = 'force-dynamic';

// Accountant-level reports: stock valuation (buying vs retail price), the
// price-change history and the activity log. Gated by the `finance` module, so
// only the owner and staff the owner granted it to can open this page — and
// every buying price in it is read here, on the server, behind that gate.
export default async function AccountsPage() {
  const session = await requireModule('finance');
  const shell = await getShellProps(session);
  const scope = await getActiveScope(session);
  const allBranches = scope === ALL_BRANCHES;

  const [store, products, priceRows, auditRows] = await Promise.all([
    prisma.store.findFirst({ select: { currency: true, name: true } }),
    prisma.product.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { stocks: true },
    }),
    prisma.productPriceHistory.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);

  const valuation: ValuationRow[] = products.map((p) => {
    const units = allBranches
      ? p.stocks.reduce((sum, s) => sum + s.stock, 0)
      : p.stocks.find((s) => s.branchId === scope)?.stock ?? 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      brand: p.brand,
      active: p.active,
      units,
      cost: p.cost,
      price: p.price,
    };
  });

  const priceHistory: PriceHistoryRow[] = priceRows.map((h) => ({
    id: h.id,
    productName: h.productName,
    source: h.source,
    oldPrice: h.oldPrice,
    newPrice: h.newPrice,
    oldCost: h.oldCost,
    newCost: h.newCost,
    onHandUnits: h.onHandUnits,
    note: h.note,
    userName: h.userName,
    createdAt: h.createdAt.toISOString(),
  }));

  // Turn the stored before/after JSON into "field: from → to" rows.
  const parse = (s: string | null): Record<string, unknown> => {
    if (!s) return {};
    try {
      const v = JSON.parse(s);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
  const show = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));
  const audit: AuditRow[] = auditRows.map((a) => {
    const before = parse(a.before);
    const after = parse(a.after);
    const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return {
      id: a.id,
      entity: a.entity,
      action: a.action,
      summary: a.summary,
      userName: a.userName,
      createdAt: a.createdAt.toISOString(),
      changes: fields.map((f) => ({ field: f, from: show(before[f]), to: show(after[f]) })),
    };
  });

  return (
    <AppShell {...shell} wide>
      <AccountsView
        valuation={valuation}
        priceHistory={priceHistory}
        audit={audit}
        currency={store?.currency ?? 'Rs'}
        storeName={store?.name ?? 'Pro Nutrition'}
        scopeLabel={shell.activeBranchName}
      />
    </AppShell>
  );
}
