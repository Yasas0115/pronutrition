import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { receivablesByCustomer, customerBalance } from '@/lib/receivables';
import { methodLabels } from '@/lib/payment-methods';
import { getShellProps } from '@/lib/shell';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import AppShell from '@/components/AppShell';
import ReceivablesView from '@/components/accounting/ReceivablesView';

export const dynamic = 'force-dynamic';

// Accounting › Receivables: everyone who owes, aged by how old each unpaid sale
// is. Gated by the `customers` grant — collecting a payment is a customer task —
// and the ledger / receive-payment actions check the same grant themselves.
export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const session = await requireModule('customers');
  const { customer } = await searchParams;
  const shell = await getShellProps(session);
  const scope = await getActiveScope(session);
  const branchId = scope === ALL_BRANCHES ? null : scope;

  const [store, rows, labels] = await Promise.all([
    prisma.store.findFirst({ select: { currency: true, name: true } }),
    receivablesByCustomer({ branchId }),
    methodLabels(prisma),
  ]);

  // The Customers page links here with ?customer=<id> to open that ledger.
  let initialCustomer: { id: string; name: string; due: number } | null = null;
  if (customer) {
    const c = await prisma.customer.findUnique({ where: { id: customer }, select: { id: true, name: true } });
    if (c) initialCustomer = { id: c.id, name: c.name, due: (await customerBalance(c.id)).due };
  }

  return (
    <AppShell {...shell} wide>
      <ReceivablesView
        rows={rows}
        currency={store?.currency ?? 'Rs'}
        storeName={store?.name ?? 'Pro Nutrition'}
        scopeLabel={shell.activeBranchName}
        methodLabels={labels}
        initialCustomer={initialCustomer}
      />
    </AppShell>
  );
}
