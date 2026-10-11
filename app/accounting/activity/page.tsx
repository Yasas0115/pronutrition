import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadAudit } from '@/lib/audit';
import { getShellProps } from '@/lib/shell';
import AppShell from '@/components/AppShell';
import ActivityView from '@/components/accounting/ActivityView';

export const dynamic = 'force-dynamic';

// Accounting › Activity log: the audit trail of products, prices, staff,
// settings and money. Its lines quote amounts, so it sits behind `finance`.
export default async function ActivityPage() {
  const session = await requireModule('finance');
  const [shell, rows] = await Promise.all([getShellProps(session), loadAudit(prisma, 200)]);

  return (
    <AppShell {...shell} wide>
      <ActivityView rows={rows} />
    </AppShell>
  );
}
