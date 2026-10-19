'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModule, requireAnyModule, requireSession } from '@/lib/auth';
import { getTillBranchId } from '@/lib/branch';
import { logAudit, diffFields } from '@/lib/audit';
import { settleCustomerPayment } from '@/lib/credit';
import { customerBalance } from '@/lib/receivables';
import { revalidateAccounting } from '@/lib/revalidate';

export type CustomerType = 'RETAIL' | 'SHOP';

export type CustomerInput = {
  id?: string;
  name: string;
  phone?: string;
  address?: string;
  type: CustomerType;
  notes?: string;
};

export type CustomerLite = { id: string; name: string; phone: string | null; type: CustomerType };

export type SaveCustomerResult =
  | { ok: true; customer: CustomerLite }
  | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

function clean(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length ? t : null;
}

function revalidateCustomers() {
  revalidatePath('/customers');
  revalidateAccounting();
  revalidatePath('/');
}

// Register a customer, or edit one. Cashiers may REGISTER a new customer from the
// till (they need the POS module); changing an existing customer's details needs
// the Customers module.
export async function saveCustomer(input: CustomerInput): Promise<SaveCustomerResult> {
  const session = input.id
    ? await requireModule('customers')
    : await requireAnyModule(['pos', 'customers']);
  const actor = { userId: session.userId, userName: session.name };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Enter the customer name.' };
  const phone = clean(input.phone);
  const type: CustomerType = input.type === 'SHOP' ? 'SHOP' : 'RETAIL';

  // The same phone twice is almost always the same person entered again — it
  // would split their credit balance across two records.
  if (phone) {
    const dup = await prisma.customer.findFirst({
      where: { phone, active: true, ...(input.id ? { NOT: { id: input.id } } : {}) },
      select: { name: true },
    });
    if (dup) return { ok: false, error: `A customer with phone ${phone} already exists (${dup.name}).` };
  }

  try {
    if (input.id) {
      const prev = await prisma.customer.findUnique({
        where: { id: input.id },
        select: { name: true, phone: true, address: true, type: true, notes: true },
      });
      if (!prev) return { ok: false, error: 'Customer not found.' };
      const c = await prisma.customer.update({
        where: { id: input.id },
        data: { name, phone, address: clean(input.address), type, notes: clean(input.notes) },
      });
      const { before, after, changed } = diffFields(prev, {
        name: c.name, phone: c.phone, address: c.address, type: c.type, notes: c.notes,
      });
      if (changed.length > 0) {
        await logAudit(prisma, {
          entity: 'CUSTOMER', entityId: c.id, action: 'UPDATE',
          summary: `Edited customer “${c.name}” — changed ${changed.join(', ')}`,
          before, after, ...actor,
        });
      }
      revalidateCustomers();
      return { ok: true, customer: { id: c.id, name: c.name, phone: c.phone, type: c.type as CustomerType } };
    }

    const c = await prisma.customer.create({
      data: {
        name, phone, address: clean(input.address), type, notes: clean(input.notes),
        createdById: session.userId, createdByName: session.name,
      },
    });
    await logAudit(prisma, {
      entity: 'CUSTOMER', entityId: c.id, action: 'CREATE',
      summary: `Registered ${type === 'SHOP' ? 'shop' : 'customer'} “${c.name}”`,
      after: { phone: c.phone, type: c.type }, ...actor,
    });
    revalidateCustomers();
    return { ok: true, customer: { id: c.id, name: c.name, phone: c.phone, type: c.type as CustomerType } };
  } catch {
    return { ok: false, error: 'Could not save the customer.' };
  }
}

// Customers are never deleted (their sales and balance must stay traceable);
// they can be switched off so they no longer appear at the till.
export async function setCustomerActive(id: string, active: boolean): Promise<SimpleResult> {
  const session = await requireModule('customers');
  try {
    const c = await prisma.customer.update({ where: { id }, data: { active } });
    await logAudit(prisma, {
      entity: 'CUSTOMER', entityId: id, action: 'UPDATE',
      summary: `${active ? 'Re-activated' : 'Deactivated'} customer “${c.name}”`,
      before: { active: !active }, after: { active },
      userId: session.userId, userName: session.name,
    });
    revalidateCustomers();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update the customer.' };
  }
}

// ---------- Ledger ----------
export type LedgerSale = {
  id: string;
  number: number;
  createdAt: string;
  total: number;
  paid: number;
  balanceDue: number;
  method: string;
  saleType: string;
  branchName: string | null;
  itemCount: number;
};

export type LedgerPayment = {
  id: string;
  createdAt: string;
  amount: number;
  method: string;
  kind: string; // SALE | SETTLEMENT
  note: string | null;
  userName: string | null;
  saleNumber: number;
  settlementId: string | null;
};

export type CustomerLedger = {
  customer: { id: string; name: string; phone: string | null; address: string | null; type: string; notes: string | null; active: boolean };
  totalDue: number;
  totalSales: number;
  sales: LedgerSale[];
  payments: LedgerPayment[];
};

export async function getCustomerLedger(
  customerId: string,
): Promise<{ ok: true; ledger: CustomerLedger } | { ok: false; error: string }> {
  await requireModule('customers');
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: 'Customer not found.' };

  const [balance, sales, payments] = await Promise.all([
    customerBalance(customerId),
    prisma.sale.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { items: { select: { qty: true } } },
    }),
    prisma.salePayment.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { sale: { select: { number: true } } },
    }),
  ]);

  return {
    ok: true,
    ledger: {
      customer: {
        id: customer.id, name: customer.name, phone: customer.phone, address: customer.address,
        type: customer.type, notes: customer.notes, active: customer.active,
      },
      totalDue: balance.due,
      totalSales: balance.bought,
      sales: sales.map((s) => ({
        id: s.id, number: s.number, createdAt: s.createdAt.toISOString(), total: s.total, paid: s.paid,
        balanceDue: s.balanceDue, method: s.method, saleType: s.saleType, branchName: s.branchName,
        itemCount: s.items.reduce((n, i) => n + i.qty, 0),
      })),
      payments: payments.map((p) => ({
        id: p.id, createdAt: p.createdAt.toISOString(), amount: p.amount, method: p.method, kind: p.kind,
        note: p.note, userName: p.userName, saleNumber: p.sale.number, settlementId: p.settlementId,
      })),
    },
  };
}

// ---------- Read-only balance for the till ----------
// Any signed-in till user may look up what a customer owes (so the cashier can
// answer "how much do I still have to pay?"), but only the unpaid bills and the
// last few payments — the full ledger and settling stay behind `customers`.
export type TillAccount = {
  name: string;
  totalDue: number;
  openSales: { number: number; createdAt: string; total: number; paid: number; balanceDue: number }[];
  recentPayments: { createdAt: string; amount: number; method: string; kind: string; saleNumber: number }[];
};

export async function getTillAccount(
  customerId: string,
): Promise<{ ok: true; account: TillAccount } | { ok: false; error: string }> {
  await requireSession();
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  if (!customer) return { ok: false, error: 'Customer not found.' };
  const [open, payments] = await Promise.all([
    prisma.sale.findMany({
      where: { customerId, balanceDue: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
      select: { number: true, createdAt: true, total: true, paid: true, balanceDue: true },
    }),
    prisma.salePayment.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { sale: { select: { number: true } } },
    }),
  ]);
  return {
    ok: true,
    account: {
      name: customer.name,
      totalDue: open.reduce((n, s) => n + s.balanceDue, 0),
      openSales: open.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
      recentPayments: payments.map((p) => ({
        createdAt: p.createdAt.toISOString(), amount: p.amount, method: p.method, kind: p.kind, saleNumber: p.sale.number,
      })),
    },
  };
}

// ---------- Receive a payment against what a customer owes ----------
export type ReceivePaymentResult =
  | {
      ok: true;
      applied: number;
      remainingDue: number;
      settlementId: string;
      allocations: { saleNumber: number; amount: number; saleDueAfter: number }[];
    }
  | { ok: false; error: string };

// Thin wrapper: auth + branch + cache refresh around lib/credit.ts, which does
// the oldest-first allocation inside one transaction.
export async function receiveCustomerPayment(input: {
  customerId: string;
  amount: number;
  method: string;
  note?: string;
}): Promise<ReceivePaymentResult> {
  const session = await requireModule('customers');
  const branchId = await getTillBranchId(session);
  try {
    const r = await settleCustomerPayment({
      customerId: input.customerId,
      amount: input.amount,
      method: input.method,
      note: input.note,
      branchId,
      userId: session.userId,
      userName: session.name,
    });
    revalidateCustomers();
    return {
      ok: true,
      applied: r.applied,
      remainingDue: r.remainingDue,
      settlementId: r.settlementId,
      allocations: r.allocations,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not record the payment.' };
  }
}
