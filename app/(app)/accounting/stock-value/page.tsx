import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadPriceHistory } from '@/lib/price-history';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import AppShell from '@/components/AppShell';
import StockValueView, { type ValuationRow } from '@/components/accounting/StockValueView';

export const dynamic = 'force-dynamic';

// Accounting › Stock value: what the stock is worth at buying and retail price,
// and the price-change history. Gated by the `finance` module, so every buying
// price in it is read here, on the server, behind that gate.
export default async function StockValuePage() {
  const session = await requireModule('finance');
  const shell = await getShellProps(session);
  const scope = await getActiveScope(session);
  const allBranches = scope === ALL_BRANCHES;

  const [store, products, priceHistory] = await Promise.all([
    prisma.store.findFirst({ select: { currency: true, name: true } }),
    prisma.product.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        category: true,
        brand: true,
        active: true,
        cost: true,
        price: true,
        stocks: { select: { branchId: true, stock: true } },
      },
    }),
    loadPriceHistory(prisma, 200),
  ]);

  const valuation: ValuationRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    brand: p.brand,
    active: p.active,
    units: allBranches
      ? p.stocks.reduce((sum, s) => sum + s.stock, 0)
      : p.stocks.find((s) => s.branchId === scope)?.stock ?? 0,
    cost: p.cost,
    price: p.price,
  }));

  return (
    <AppShell {...shell} wide>
      <StockValueView
        valuation={valuation}
        priceHistory={priceHistory}
        currency={store?.currency ?? 'Rs'}
        storeName={store?.name ?? 'Pro Nutrition'}
        scopeLabel={shell.activeBranchName}
      />
    </AppShell>
  );
}
