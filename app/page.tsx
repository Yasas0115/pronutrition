import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import { getTillBranchId } from '@/lib/branch';
import AppShell from '@/components/AppShell';
import POSView from '@/components/POSView';

// Stock changes on every sale, so never cache this screen.
export const dynamic = 'force-dynamic';

export default async function POSPage() {
  const session = await requireModule('pos');
  const [shell, branchId] = await Promise.all([getShellProps(session), getTillBranchId(session)]);

  const [store, products, methods, tillBranch] = await Promise.all([
    prisma.store.findFirst(),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { stocks: true },
    }),
    prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    branchId ? prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : null,
  ]);

  const items = products.map((p) => {
    const row = branchId ? p.stocks.find((s) => s.branchId === branchId) : undefined;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      brand: p.brand,
      flavor: p.flavor,
      sku: p.sku,
      barcode: p.barcode,
      price: p.price,
      imageUrl: p.imageUrl,
      stock: row?.stock ?? 0,
      lowStockAt: row?.lowStockAt ?? 5,
    };
  });

  const paymentMethods = methods.map((m) => ({
    key: m.key,
    label: m.label,
    discountPercent: m.discountPercent,
  }));

  return (
    <AppShell {...shell} wide>
      <POSView
        products={items}
        paymentMethods={paymentMethods}
        currency={store?.currency ?? 'Rs'}
        taxPercent={store?.taxPercent ?? 0}
        storeName={store?.name ?? 'Pro Nutrition'}
        storePhone={store?.phone ?? null}
        storeAddress={store?.address ?? null}
        receiptNote={store?.receiptNote ?? null}
        branchName={tillBranch?.name ?? 'No branch — open one first'}
        cashierName={session.name}
      />
    </AppShell>
  );
}
