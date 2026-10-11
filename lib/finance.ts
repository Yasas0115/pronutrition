// Money-out core: expenses, petty cash, salary payments and the till float.
// Kept out of the server actions so it can be exercised directly in tests (like
// lib/checkout.ts and lib/credit.ts). Every function runs as one transaction and
// writes its own AuditLog row, so a change and its trail can never disagree.
//
// Principles:
//   • Append-only. Nothing is edited or deleted; a mistake is VOIDED with a
//     reason (kept, struck through, excluded from every report).
//   • Two dates on everything: `expenseDate` / `paidAt` is the business day the
//     money belongs to (editable at entry, never in the future), `createdAt` is
//     the real moment it was typed in.
import { prisma } from './db';
import { logAudit } from './audit';
import { parseDay, endOfDay, monthRange } from './dates';
import { fmt } from './money';

export const PAID_VIA = ['CASH', 'BANK', 'CARD'] as const;
export type PaidVia = (typeof PAID_VIA)[number];

export const PETTY_CASH_CATEGORY = 'Petty cash';
export const SALARY_CATEGORY = 'Salary';

export type Actor = { userId: string | null; userName: string | null };

function whole(n: unknown): number {
  return Math.round(Number(n) || 0);
}

function paidViaOf(v: string | undefined | null): PaidVia {
  const key = (v ?? 'CASH').toUpperCase();
  if (!(PAID_VIA as readonly string[]).includes(key)) throw new Error('Choose cash, bank or card.');
  return key as PaidVia;
}

// A business date typed as YYYY-MM-DD (Sri Lanka). Past dates are fine (catching
// up on yesterday's slip); the future is not — you cannot have spent it yet.
function businessDate(ymd: string): Date {
  const d = parseDay(ymd);
  if (!d) throw new Error('Pick a valid date.');
  if (d.getTime() > endOfDay(new Date()).getTime()) throw new Error('The date cannot be in the future.');
  return d;
}

function needReason(reason: string | undefined | null, what: string): string {
  const r = (reason ?? '').trim();
  if (r.length < 3) throw new Error(`Give a reason for ${what} (at least a few words).`);
  return r;
}

// ---------------------------------------------------------------- expenses
export type NewExpense = Actor & {
  kind?: 'GENERAL' | 'PETTY_CASH';
  category?: string; // GENERAL: must be on the pick-list
  amount: number;
  description?: string;
  paidVia?: string;
  date: string; // YYYY-MM-DD
  branchId?: string | null;
  workerId?: string | null; // PETTY_CASH: who took the cash …
  workerName?: string | null; // … or a free-text name if they are not on the workers list
};

export async function addExpense(input: NewExpense): Promise<{ id: string }> {
  const kind = input.kind === 'PETTY_CASH' ? 'PETTY_CASH' : 'GENERAL';
  const amount = whole(input.amount);
  if (amount <= 0) throw new Error('Enter the amount.');
  const expenseDate = businessDate(input.date);
  const description = input.description?.trim() || null;

  return prisma.$transaction(async (tx) => {
    let category: string;
    let paidVia: PaidVia;
    let workerId: string | null = null;
    let workerName: string | null = null;

    if (kind === 'PETTY_CASH') {
      // Petty cash is cash by definition, always a plain expense (it is never
      // taken off a salary), and must say who had it and what for.
      category = PETTY_CASH_CATEGORY;
      paidVia = 'CASH';
      if (input.workerId) {
        const w = await tx.worker.findUnique({ where: { id: input.workerId }, select: { id: true, name: true } });
        if (!w) throw new Error('That worker no longer exists.');
        workerId = w.id;
        workerName = w.name;
      } else {
        workerName = input.workerName?.trim() || null;
        if (!workerName) throw new Error('Say who took the cash.');
      }
      if (!description) throw new Error('Say what the cash was for.');
    } else {
      paidVia = paidViaOf(input.paidVia);
      const cat = await tx.expenseCategory.findUnique({ where: { name: (input.category ?? '').trim() } });
      if (!cat) throw new Error('Pick a category from the list.');
      category = cat.name;
    }

    const branch = input.branchId
      ? await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true, name: true } })
      : null;
    if (input.branchId && !branch) throw new Error('That branch no longer exists.');

    const e = await tx.expense.create({
      data: {
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? null,
        kind,
        category,
        amount,
        description,
        paidVia,
        expenseDate,
        workerId,
        workerName,
        userId: input.userId,
        userName: input.userName,
      },
    });

    await logAudit(tx, {
      entity: 'EXPENSE',
      entityId: e.id,
      action: 'CREATE',
      summary:
        kind === 'PETTY_CASH'
          ? `Petty cash Rs ${fmt(amount)} to ${workerName} — ${description}`
          : `Expense Rs ${fmt(amount)} — ${category}${branch ? ` (${branch.name})` : ''}`,
      after: { kind, category, amount, paidVia, date: input.date },
      branchId: branch?.id ?? null,
      userId: input.userId,
      userName: input.userName,
    });
    return { id: e.id };
  });
}

export async function voidExpense(input: Actor & { id: string; reason: string }): Promise<void> {
  const reason = needReason(input.reason, 'voiding this expense');
  await prisma.$transaction(async (tx) => {
    const e = await tx.expense.findUnique({ where: { id: input.id } });
    if (!e) throw new Error('Expense not found.');
    if (e.voidedAt) throw new Error('This expense is already voided.');
    if (e.kind === 'SALARY') throw new Error('Void the salary payment instead — that voids this entry too.');
    await tx.expense.update({
      where: { id: e.id },
      data: { voidedAt: new Date(), voidedByName: input.userName, voidReason: reason },
    });
    await logAudit(tx, {
      entity: 'EXPENSE',
      entityId: e.id,
      action: 'VOID',
      summary: `Voided ${e.kind === 'PETTY_CASH' ? 'petty cash' : 'expense'} Rs ${fmt(e.amount)} (${e.category}) — ${reason}`,
      before: { amount: e.amount, category: e.category },
      branchId: e.branchId,
      userId: input.userId,
      userName: input.userName,
    });
  });
}

// ---------------------------------------------------------------- salaries
export type NewSalaryPayment = Actor & {
  workerId: string;
  period: string; // YYYY-MM the salary is for
  base: number; // the part of the monthly salary this payment covers
  bonus?: number;
  deduction?: number;
  paidVia?: string;
  date: string; // YYYY-MM-DD it was paid
  note?: string;
  branchId?: string | null;
};

export async function paySalary(input: NewSalaryPayment): Promise<{ id: string; netPaid: number }> {
  if (!monthRange(input.period)) throw new Error('Pick the salary month.');
  const base = whole(input.base);
  const bonus = Math.max(0, whole(input.bonus));
  const deduction = Math.max(0, whole(input.deduction));
  if (base < 0) throw new Error('The salary amount cannot be negative.');
  if (deduction > base + bonus) throw new Error('The deduction is more than the amount being paid.');
  const netPaid = base + bonus - deduction;
  if (netPaid <= 0) throw new Error('Nothing to pay — the net amount must be more than zero.');
  const paidVia = paidViaOf(input.paidVia);
  const paidAt = businessDate(input.date);
  const note = input.note?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const w = await tx.worker.findUnique({ where: { id: input.workerId } });
    if (!w) throw new Error('That worker no longer exists.');

    // Guard against paying the same month's salary twice by accident. Extras go
    // in the Bonus field, which is not capped.
    if (w.monthlySalary > 0) {
      const done = await tx.salaryPayment.aggregate({
        where: { workerId: w.id, period: input.period, voidedAt: null },
        _sum: { baseAmount: true },
      });
      const paidBase = done._sum.baseAmount ?? 0;
      if (paidBase + base > w.monthlySalary) {
        throw new Error(
          `${w.name}'s salary for ${input.period} is Rs ${fmt(w.monthlySalary)} and Rs ${fmt(paidBase)} is already paid. ` +
            `Use the Bonus field for anything extra.`,
        );
      }
    }

    const branchId = input.branchId ?? w.branchId ?? null;
    const branch = branchId
      ? await tx.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } })
      : null;

    const sp = await tx.salaryPayment.create({
      data: {
        workerId: w.id,
        workerName: w.name,
        period: input.period,
        baseAmount: base,
        bonus,
        deduction,
        netPaid,
        paidVia,
        paidAt,
        note,
        branchId: branch?.id ?? null,
        userId: input.userId,
        userName: input.userName,
      },
    });

    // The cash that actually left is what counts against profit.
    await tx.expense.create({
      data: {
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? null,
        kind: 'SALARY',
        category: SALARY_CATEGORY,
        amount: netPaid,
        description: `Salary ${input.period} — ${w.name}`,
        paidVia,
        expenseDate: paidAt,
        workerId: w.id,
        workerName: w.name,
        salaryPaymentId: sp.id,
        userId: input.userId,
        userName: input.userName,
      },
    });

    await logAudit(tx, {
      entity: 'SALARY',
      entityId: sp.id,
      action: 'PAYMENT',
      summary: `Paid salary Rs ${fmt(netPaid)} to ${w.name} for ${input.period}`,
      after: { base, bonus, deduction, netPaid, paidVia },
      branchId: branch?.id ?? null,
      userId: input.userId,
      userName: input.userName,
    });
    return { id: sp.id, netPaid };
  });
}

export async function voidSalaryPayment(input: Actor & { id: string; reason: string }): Promise<void> {
  const reason = needReason(input.reason, 'voiding this salary payment');
  await prisma.$transaction(async (tx) => {
    const sp = await tx.salaryPayment.findUnique({ where: { id: input.id }, include: { expense: true } });
    if (!sp) throw new Error('Salary payment not found.');
    if (sp.voidedAt) throw new Error('This salary payment is already voided.');
    const now = new Date();
    const data = { voidedAt: now, voidedByName: input.userName, voidReason: reason };
    await tx.salaryPayment.update({ where: { id: sp.id }, data });
    if (sp.expense && !sp.expense.voidedAt) await tx.expense.update({ where: { id: sp.expense.id }, data });
    await logAudit(tx, {
      entity: 'SALARY',
      entityId: sp.id,
      action: 'VOID',
      summary: `Voided salary Rs ${fmt(sp.netPaid)} for ${sp.workerName} (${sp.period}) — ${reason}`,
      before: { netPaid: sp.netPaid, period: sp.period },
      branchId: sp.branchId,
      userId: input.userId,
      userName: input.userName,
    });
  });
}

// ------------------------------------------------------------------- float
// Set a branch's till float to a new fixed amount. Never changes profit (it is
// the cash kept in the drawer for change, not income or expense); the old and
// new amount, the reason, who and when are all kept.
export async function setBranchFloat(
  input: Actor & { branchId: string; amount: number; reason: string },
): Promise<{ oldAmount: number; newAmount: number }> {
  const amount = whole(input.amount);
  if (amount < 0) throw new Error('The float cannot be negative.');
  const reason = needReason(input.reason, 'changing the float');

  return prisma.$transaction(async (tx) => {
    const b = await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true, name: true, floatAmount: true } });
    if (!b) throw new Error('Branch not found.');
    if (b.floatAmount === amount) throw new Error(`The float is already Rs ${fmt(amount)}.`);

    // Conditional update so two people editing at once can't both log "from X".
    const res = await tx.branch.updateMany({
      where: { id: b.id, floatAmount: b.floatAmount },
      data: { floatAmount: amount },
    });
    if (res.count === 0) throw new Error('The float was just changed by someone else — reload and try again.');

    await tx.floatAdjustment.create({
      data: {
        branchId: b.id,
        branchName: b.name,
        oldAmount: b.floatAmount,
        newAmount: amount,
        delta: amount - b.floatAmount,
        reason,
        userId: input.userId,
        userName: input.userName,
      },
    });
    await logAudit(tx, {
      entity: 'FLOAT',
      entityId: b.id,
      action: 'UPDATE',
      summary: `Float at ${b.name} changed Rs ${fmt(b.floatAmount)} → Rs ${fmt(amount)} — ${reason}`,
      before: { float: b.floatAmount },
      after: { float: amount },
      branchId: b.id,
      userId: input.userId,
      userName: input.userName,
    });
    return { oldAmount: b.floatAmount, newAmount: amount };
  });
}
