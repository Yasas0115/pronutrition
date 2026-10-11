// Credit settlement core: takes money from a customer and spreads it across the
// unpaid credit sales they owe on, OLDEST FIRST, inside one transaction. Kept
// out of the server action so it can be exercised directly in tests (like
// lib/checkout.ts).
//
// A customer's balance is never stored — it is the sum of `balanceDue` over
// their sales. Settling therefore just moves `balanceDue` down and `paid` up on
// each sale, and writes one dated SalePayment row per slice (all tied together
// by one settlementId), so the balance is correct the instant this commits.
import { randomUUID } from 'crypto';
import { prisma } from './db';
import { logAudit } from './audit';
import { SETTLEMENT_METHODS } from './payment-methods';
import { fmt } from './money';

export type SettlementInput = {
  customerId: string;
  amount: number;
  method: string; // CASH | CARD | BANK
  note?: string | null;
  branchId: string | null; // where the money was received
  userId: string | null;
  userName: string | null;
};

export type SettlementResult = {
  settlementId: string;
  customerName: string;
  applied: number;
  remainingDue: number;
  allocations: { saleNumber: number; amount: number; saleDueAfter: number }[];
};

export async function settleCustomerPayment(input: SettlementInput): Promise<SettlementResult> {
  const amount = Math.round(Number(input.amount) || 0);
  if (amount <= 0) throw new Error('Enter the amount received.');
  if (!(SETTLEMENT_METHODS as readonly string[]).includes(input.method)) {
    throw new Error('Choose cash, card or bank transfer.');
  }
  const settlementId = randomUUID();
  const note = input.note?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, name: true },
    });
    if (!customer) throw new Error('Customer not found.');

    const open = await tx.sale.findMany({
      where: { customerId: customer.id, balanceDue: { gt: 0 } },
      orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, balanceDue: true },
    });
    const due = open.reduce((n, s) => n + s.balanceDue, 0);
    if (due <= 0) throw new Error(`${customer.name} has nothing outstanding.`);
    if (amount > due) throw new Error(`${customer.name} only owes Rs ${fmt(due)} — that is more than is due.`);

    let left = amount;
    const allocations: SettlementResult['allocations'] = [];
    for (const s of open) {
      if (left <= 0) break;
      const apply = Math.min(left, s.balanceDue);
      // Conditional update: if another till settled this sale a moment ago the
      // guard fails and the whole payment rolls back instead of over-paying.
      const res = await tx.sale.updateMany({
        where: { id: s.id, balanceDue: { gte: apply } },
        data: { balanceDue: { decrement: apply }, paid: { increment: apply } },
      });
      if (res.count === 0) throw new Error('This account was just updated elsewhere — reload and try again.');
      await tx.salePayment.create({
        data: {
          saleId: s.id,
          customerId: customer.id,
          branchId: input.branchId,
          amount: apply,
          method: input.method,
          kind: 'SETTLEMENT',
          settlementId,
          note,
          userId: input.userId,
          userName: input.userName,
        },
      });
      allocations.push({ saleNumber: s.number, amount: apply, saleDueAfter: s.balanceDue - apply });
      left -= apply;
    }

    await logAudit(tx, {
      entity: 'CUSTOMER',
      entityId: customer.id,
      action: 'PAYMENT',
      summary: `Received Rs ${fmt(amount)} (${input.method}) from “${customer.name}” — ${allocations.length} sale${allocations.length === 1 ? '' : 's'} settled`,
      after: { amount, method: input.method, remainingDue: due - amount },
      branchId: input.branchId,
      userId: input.userId,
      userName: input.userName,
    });

    return { settlementId, customerName: customer.name, applied: amount, remainingDue: due - amount, allocations };
  });
}
