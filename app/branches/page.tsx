import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import AppShell from '@/components/AppShell';
import BranchesView from '@/components/BranchesView';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const session = await requireModule('branches');
  const [shell, store, branches] = await Promise.all([
    getShellProps(session),
    prisma.store.findFirst({ select: { currency: true } }),
    prisma.branch.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { users: true, sales: true } },
        stocks: { select: { stock: true } },
      },
    }),
  ]);

  const items = branches.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    phone: b.phone,
    address: b.address,
    active: b.active,
    staff: b._count.users,
    sales: b._count.sales,
    units: b.stocks.reduce((sum, s) => sum + s.stock, 0),
  }));

  return (
    <AppShell {...shell}>
      <BranchesView branches={items} currency={store?.currency ?? 'Rs'} />
    </AppShell>
  );
}
