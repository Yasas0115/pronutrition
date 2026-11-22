import { requireModule, canSeeCost } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n/server';
import { getTillBranchId } from '@/lib/branch';
import { dueByCustomerId } from '@/lib/receivables';
import { livePromotions } from '@/lib/promotions';
import { loadImageMeta, coverUrl } from '@/lib/product-images';
import POSView from '@/components/POSView';

// Stock changes on every sale, so never cache this screen.
export const dynamic = 'force-dynamic';

export default async function POSPage() {
  const t = await getT();
  const session = await requireModule('pos');
  const branchId = await getTillBranchId(session);

  const [store, products, methods, tillBranch, customerRows, dueByCustomer, promotions, imageMeta] = await Promise.all([
    prisma.store.findFirst(),
    // The till never needs the buying price, so it is not even loaded here
    // (explicit select) — cost can't leak through this page by accident.
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        category: true,
        brand: true,
        flavor: true,
        sku: true,
        barcode: true,
        price: true,
        stocks: { select: { branchId: true, stock: true, lowStockAt: true } },
      },
    }),
    prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    branchId ? prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : null,
    prisma.customer.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true, type: true },
    }),
    // What each customer already owes, so the till can warn before more credit.
    dueByCustomerId(),
    livePromotions(prisma),
    // Photos are served as cacheable images (/api/product-image/...) instead of
    // being embedded in this page, which used to make every load multi-megabyte.
    loadImageMeta(),
  ]);

  const customers = customerRows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    type: (c.type === 'SHOP' ? 'SHOP' : 'RETAIL') as 'RETAIL' | 'SHOP',
    due: dueByCustomer.get(c.id) ?? 0,
  }));

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
      imageUrl: coverUrl(p.id, imageMeta.get(p.id)),
      stock: row?.stock ?? 0,
      lowStockAt: row?.lowStockAt ?? 5,
    };
  });

  const paymentMethods = methods.map((m) => ({
    key: m.key,
    label: m.label,
    discountPercent: m.discountPercent,
    requiresCustomer: m.requiresCustomer,
    allowsPartial: m.allowsPartial,
  }));

  return (
    <>
      <POSView
        products={items}
        paymentMethods={paymentMethods}
        promotions={promotions}
        customers={customers}
        currency={store?.currency ?? 'Rs'}
        taxPercent={store?.taxPercent ?? 0}
        storeName={store?.name ?? 'Pro Nutrition'}
        storePhone={store?.phone ?? null}
        storeAddress={store?.address ?? null}
        receiptNote={store?.receiptNote ?? null}
        branchName={tillBranch?.name ?? t('No branch — open one first')}
        cashierName={session.name}
        canBackdate={await canSeeCost(session)}
      />
    </>
  );
}
