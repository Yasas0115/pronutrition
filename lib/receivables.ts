// The one place that defines "what a customer owes": the sum of `balanceDue`
// over their sales where it is above zero. Nothing is stored on the customer, so
// the figure can never drift from the sales it is made of. Server-only.
//
// Used by Accounting › Receivables (ageing), the till (warn before more credit)
// and the customer ledger. Allocating a payment oldest-first is lib/credit.ts.
import type { Prisma } from '@prisma/client';
import { prisma } from './db';

const DAY_MS = 86_400_000;

export type ReceivableRow = {
  key: string; // customer id, or "name:<snapshot>" when the sale has no customer record
  customerId: string | null;
  name: string;
  due: number;
  count: number; // unpaid sales
  oldestAt: string; // ISO — the oldest unpaid sale
  b0: number; // 0–30 days old
  b30: number; // 31–60
  b60: number; // 61–90
  b90: number; // 90+
};

/** Everyone who owes money, biggest debt first, with each debt aged into buckets. */
export async function receivablesByCustomer(
  opts: { branchId?: string | null; now?: Date } = {},
): Promise<ReceivableRow[]> {
  const now = opts.now ?? new Date();
  const where: Prisma.SaleWhereInput = {
    balanceDue: { gt: 0 },
    ...(opts.branchId ? { branchId: opts.branchId } : {}),
  };
  const open = await prisma.sale.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: { customerId: true, customerName: true, balanceDue: true, createdAt: true },
  });

  const rows = new Map<string, ReceivableRow>();
  for (const s of open) {
    const key = s.customerId ?? `name:${s.customerName ?? 'unknown'}`;
    const row =
      rows.get(key) ??
      {
        key,
        customerId: s.customerId,
        name: s.customerName ?? 'Unknown',
        due: 0,
        count: 0,
        oldestAt: s.createdAt.toISOString(),
        b0: 0,
        b30: 0,
        b60: 0,
        b90: 0,
      };
    const days = Math.floor((now.getTime() - s.createdAt.getTime()) / DAY_MS);
    row.due += s.balanceDue;
    row.count += 1;
    if (days <= 30) row.b0 += s.balanceDue;
    else if (days <= 60) row.b30 += s.balanceDue;
    else if (days <= 90) row.b60 += s.balanceDue;
    else row.b90 += s.balanceDue;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort((a, b) => b.due - a.due);
}

/** Company-wide amount owed per registered customer id (the till's credit warning). */
export async function dueByCustomerId(): Promise<Map<string, number>> {
  const rows = await prisma.sale.groupBy({
    by: ['customerId'],
    where: { customerId: { not: null }, balanceDue: { gt: 0 } },
    _sum: { balanceDue: true },
  });
  return new Map(rows.map((r) => [r.customerId as string, r._sum.balanceDue ?? 0]));
}

/** One customer's running balance and lifetime purchases, company-wide. */
export async function customerBalance(customerId: string): Promise<{ due: number; bought: number }> {
  const agg = await prisma.sale.aggregate({
    where: { customerId },
    _sum: { balanceDue: true, total: true },
  });
  return { due: agg._sum.balanceDue ?? 0, bought: agg._sum.total ?? 0 };
}
