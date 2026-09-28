import { requireSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, getEffectiveModules, ALL_BRANCHES } from '@/lib/branch';
import { landingRoute } from '@/lib/modules';
import AppShell from '@/components/AppShell';
import ProductsStockView, { type StockProduct, type MovementRow } from '@/components/ProductsStockView';
import { galleryOf } from '@/lib/images';

export const dynamic = 'force-dynamic';

// Unified Products & Stock page: the catalogue and per-branch stock control on a
// single screen. Reachable by anyone granted either the products or the stock
// module; each half of the UI is gated by the matching grant.
export default async function ProductsPage() {
  const session = await requireSession();
  const eff = await getEffectiveModules(session);
  const canEditProducts = eff.has('products');
  const canManageStock = eff.has('stock');
  if (!canEditProducts && !canManageStock) redirect(landingRoute(eff));

  const scope = await getActiveScope(session);
  const allBranches = scope === ALL_BRANCHES;

  const [shell, store, products, categories, branches] = await Promise.all([
    getShellProps(session),
    prisma.store.findFirst({ select: { currency: true } }),
    prisma.product.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { stocks: true },
    }),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.branch.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, active: true },
    }),
  ]);

  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const items: StockProduct[] = products.map((p) => {
    const branchRow = allBranches ? undefined : p.stocks.find((s) => s.branchId === scope);
    const stock = allBranches
      ? p.stocks.reduce((sum, s) => sum + s.stock, 0)
      : branchRow?.stock ?? 0;
    const lowStockAt = branchRow?.lowStockAt ?? 5;
    const perBranch = allBranches
      ? branches.map((b) => ({
          branchId: b.id,
          branchName: b.name,
          stock: p.stocks.find((s) => s.branchId === b.id)?.stock ?? 0,
          lowStockAt: p.stocks.find((s) => s.branchId === b.id)?.lowStockAt ?? 5,
        }))
      : [];
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      brand: p.brand,
      flavor: p.flavor,
      sku: p.sku,
      barcode: p.barcode,
      price: p.price,
      cost: p.cost,
      imageUrl: p.imageUrl,
      images: galleryOf(p),
      stock,
      lowStockAt,
      active: p.active,
      perBranch,
    };
  });

  // Recent movement ledger — scoped to the active branch, or company-wide.
  const history: MovementRow[] = canManageStock
    ? (
        await prisma.stockMovement.findMany({
          where: allBranches ? undefined : { branchId: scope },
          orderBy: { createdAt: 'desc' },
          take: 80,
        })
      ).map((m) => ({
        id: m.id,
        productName: m.productName,
        branchName: branchName.get(m.branchId) ?? '—',
        type: m.type,
        delta: m.delta,
        balanceAfter: m.balanceAfter,
        unitCost: m.unitCost,
        note: m.note,
        userName: m.userName,
        createdAt: m.createdAt.toISOString(),
      }))
    : [];

  return (
    <AppShell {...shell} wide>
      <ProductsStockView
        products={items}
        history={history}
        currency={store?.currency ?? 'Rs'}
        categories={categories.map((c) => c.name)}
        branches={branches}
        activeScope={scope}
        activeBranchName={shell.activeBranchName}
        allBranches={allBranches}
        isOwner={session.role === 'OWNER'}
        canEditProducts={canEditProducts}
        canManageStock={canManageStock}
      />
    </AppShell>
  );
}
