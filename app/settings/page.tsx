import { requireOwner } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import AppShell from '@/components/AppShell';
import SettingsView from '@/components/SettingsView';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireOwner();
  const [shell, store, methods, promos] = await Promise.all([
    getShellProps(session),
    prisma.store.findFirst(),
    prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);

  return (
    <AppShell {...shell}>
      <SettingsView
        store={{
          name: store?.name ?? 'Pro Nutrition',
          currency: store?.currency ?? 'Rs',
          phone: store?.phone ?? '',
          address: store?.address ?? '',
          receiptNote: store?.receiptNote ?? '',
          taxPercent: store?.taxPercent ?? 0,
          logoUrl: store?.logoUrl ?? null,
        }}
        paymentMethods={methods.map((m) => ({ key: m.key, label: m.label, discountPercent: m.discountPercent }))}
        promotions={promos.map((p) => ({
          id: p.id, name: p.name, percent: p.percent, startsOn: p.startsOn, endsOn: p.endsOn, active: p.active,
        }))}
      />
    </AppShell>
  );
}
