import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import AppShell from '@/components/AppShell';
import CustomersView, { type CustomerRow } from '@/components/CustomersView';

export const dynamic = 'force-dynamic';

// The customer directory: people and bulk-buying shops, with how often they
// buy. No money is read here — what each one owes, their ledger and payments
// are Accounting › Receivables, behind the same `customers` grant.
export default async function CustomersPage() {
  const session = await requireModule('customers');
  const shell = await getShellProps(session);

  const [customers, activity] = await Promise.all([
    prisma.customer.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.sale.groupBy({
      by: ['customerId'],
      where: { customerId: { not: null } },
      _count: true,
      _max: { createdAt: true },
    }),
  ]);

  const activityBy = new Map(activity.map((a) => [a.customerId as string, a]));

  const rows: CustomerRow[] = customers.map((c) => {
    const a = activityBy.get(c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      notes: c.notes,
      type: c.type === 'SHOP' ? 'SHOP' : 'RETAIL',
      active: c.active,
      salesCount: a?._count ?? 0,
      lastPurchaseAt: a?._max.createdAt?.toISOString() ?? null,
    };
  });

  return (
    <AppShell {...shell} wide>
      <CustomersView customers={rows} />
    </AppShell>
  );
}
