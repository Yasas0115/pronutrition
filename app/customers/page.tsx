import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import AppShell from '@/components/AppShell';
import CustomersView, { type CustomerRow } from '@/components/CustomersView';

export const dynamic = 'force-dynamic';

// Registered customers (people and bulk-buying shops) with what each one owes.
// A customer's balance is the sum of `balanceDue` over their sales — it is never
// stored separately, so it can't drift from the sales it is made of.
export default async function CustomersPage() {
  const session = await requireModule('customers');
  const shell = await getShellProps(session);

  const [store, customers, totals, owing] = await Promise.all([
    prisma.store.findFirst({ select: { currency: true, name: true } }),
    prisma.customer.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.sale.groupBy({
      by: ['customerId'],
      where: { customerId: { not: null } },
      _sum: { total: true },
      _count: true,
      _max: { createdAt: true },
    }),
    prisma.sale.groupBy({
      by: ['customerId'],
      where: { customerId: { not: null }, balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
      _min: { createdAt: true },
    }),
  ]);

  const totalBy = new Map(totals.map((t) => [t.customerId as string, t]));
  const owingBy = new Map(owing.map((o) => [o.customerId as string, o]));

  const rows: CustomerRow[] = customers.map((c) => {
    const t = totalBy.get(c.id);
    const o = owingBy.get(c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      notes: c.notes,
      type: c.type === 'SHOP' ? 'SHOP' : 'RETAIL',
      active: c.active,
      totalBought: t?._sum.total ?? 0,
      salesCount: t?._count ?? 0,
      lastPurchaseAt: t?._max.createdAt?.toISOString() ?? null,
      due: o?._sum.balanceDue ?? 0,
      oldestDueAt: o?._min.createdAt?.toISOString() ?? null,
    };
  });

  return (
    <AppShell {...shell} wide>
      <CustomersView
        customers={rows}
        currency={store?.currency ?? 'Rs'}
        storeName={store?.name ?? 'Pro Nutrition'}
      />
    </AppShell>
  );
}
