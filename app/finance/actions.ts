'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModule } from '@/lib/auth';
import type { Session } from '@/lib/session';
import { logAudit, diffFields } from '@/lib/audit';
import {
  addExpense,
  voidExpense,
  paySalary,
  voidSalaryPayment,
  setBranchFloat,
  PETTY_CASH_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/finance';

export type SimpleResult = { ok: true } | { ok: false; error: string };

function revalidateFinance() {
  revalidatePath('/finance');
  revalidatePath('/accounts');
}

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

// Who is doing it, for the "recorded by" snapshot on every row.
const actorOf = (s: Session) => ({ userId: s.userId, userName: s.name });

// A staff member pinned to one branch can only record money for that branch;
// the owner (and unpinned staff) may pick any branch or "company-wide" (null).
function branchFor(session: Session, requested: string | null | undefined): string | null {
  if (session.role !== 'OWNER' && session.branchId) return session.branchId;
  return requested || null;
}

// ---------------------------------------------------------------- expenses
export async function addExpenseAction(input: {
  category: string;
  amount: number;
  description?: string;
  paidVia: string;
  date: string;
  branchId?: string | null;
}): Promise<SimpleResult> {
  const session = await requireModule('finance');
  try {
    await addExpense({
      kind: 'GENERAL',
      category: input.category,
      amount: input.amount,
      description: input.description,
      paidVia: input.paidVia,
      date: input.date,
      branchId: branchFor(session, input.branchId),
      ...actorOf(session),
    });
    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return fail(e, 'Could not save the expense.');
  }
}

export async function addPettyCashAction(input: {
  workerId?: string | null;
  workerName?: string;
  amount: number;
  description: string;
  date: string;
  branchId?: string | null;
}): Promise<SimpleResult> {
  const session = await requireModule('finance');
  try {
    await addExpense({
      kind: 'PETTY_CASH',
      amount: input.amount,
      description: input.description,
      date: input.date,
      workerId: input.workerId,
      workerName: input.workerName,
      branchId: branchFor(session, input.branchId),
      ...actorOf(session),
    });
    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return fail(e, 'Could not save the petty cash entry.');
  }
}

export async function voidExpenseAction(id: string, reason: string): Promise<SimpleResult> {
  const session = await requireModule('finance');
  try {
    await voidExpense({ id, reason, ...actorOf(session) });
    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return fail(e, 'Could not void the entry.');
  }
}

// ------------------------------------------------------ expense categories
const RESERVED = [SALARY_CATEGORY.toLowerCase(), PETTY_CASH_CATEGORY.toLowerCase()];

export async function addExpenseCategory(name: string): Promise<SimpleResult> {
  await requireModule('finance');
  const n = (name ?? '').trim();
  if (!n) return { ok: false, error: 'Enter a category name.' };
  if (n.length > 40) return { ok: false, error: 'Category name is too long.' };
  if (RESERVED.includes(n.toLowerCase())) {
    return { ok: false, error: `“${n}” is used automatically for ${n.toLowerCase() === 'salary' ? 'salary payments' : 'petty cash'}.` };
  }
  try {
    const max = await prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
    await prisma.expenseCategory.create({ data: { name: n, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    revalidateFinance();
    return { ok: true };
  } catch {
    return { ok: false, error: `“${n}” already exists.` };
  }
}

// Past expenses keep the category as plain text, so removing one from the list
// never changes any report.
export async function deleteExpenseCategory(id: string): Promise<SimpleResult> {
  await requireModule('finance');
  try {
    await prisma.expenseCategory.delete({ where: { id } });
    revalidateFinance();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not delete the category.' };
  }
}

// ----------------------------------------------------------------- workers
export type WorkerInput = {
  id?: string;
  name: string;
  title?: string;
  phone?: string;
  branchId?: string | null;
  monthlySalary: number;
};

export async function saveWorker(input: WorkerInput): Promise<SimpleResult> {
  const session = await requireModule('finance');
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Enter the worker’s name.' };
  const monthlySalary = Math.max(0, Math.round(Number(input.monthlySalary) || 0));
  const data = {
    name,
    title: input.title?.trim() || null,
    phone: input.phone?.trim() || null,
    branchId: branchFor(session, input.branchId),
    monthlySalary,
  };
  try {
    if (input.id) {
      const prev = await prisma.worker.findUnique({ where: { id: input.id } });
      if (!prev) return { ok: false, error: 'Worker not found.' };
      const w = await prisma.worker.update({ where: { id: input.id }, data });
      const pick = (x: typeof prev) => ({ name: x.name, title: x.title, phone: x.phone, branchId: x.branchId, monthlySalary: x.monthlySalary });
      const { before, after, changed } = diffFields(pick(prev), pick(w));
      if (changed.length > 0) {
        await logAudit(prisma, {
          entity: 'WORKER', entityId: w.id, action: 'UPDATE',
          summary: `Edited worker “${w.name}” — changed ${changed.join(', ')}`,
          before, after, ...actorOf(session),
        });
      }
    } else {
      const w = await prisma.worker.create({ data });
      await logAudit(prisma, {
        entity: 'WORKER', entityId: w.id, action: 'CREATE',
        summary: `Added worker “${w.name}” (salary Rs ${w.monthlySalary.toLocaleString('en-LK')})`,
        after: { monthlySalary: w.monthlySalary }, ...actorOf(session),
      });
    }
    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return fail(e, 'Could not save the worker.');
  }
}

// Workers are never deleted (their salary history must stay readable); they are
// switched off when they leave.
export async function setWorkerActive(id: string, active: boolean): Promise<SimpleResult> {
  const session = await requireModule('finance');
  try {
    const w = await prisma.worker.update({ where: { id }, data: { active } });
    await logAudit(prisma, {
      entity: 'WORKER', entityId: id, action: 'UPDATE',
      summary: `${active ? 'Re-activated' : 'Deactivated'} worker “${w.name}”`,
      before: { active: !active }, after: { active }, ...actorOf(session),
    });
    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return fail(e, 'Could not update the worker.');
  }
}

// ---------------------------------------------------------------- salaries
export async function paySalaryAction(input: {
  workerId: string;
  period: string;
  base: number;
  bonus?: number;
  deduction?: number;
  paidVia: string;
  date: string;
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('finance');
  try {
    await paySalary({
      ...input,
      branchId: session.role !== 'OWNER' ? session.branchId : null,
      ...actorOf(session),
    });
    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return fail(e, 'Could not record the salary payment.');
  }
}

export async function voidSalaryAction(id: string, reason: string): Promise<SimpleResult> {
  const session = await requireModule('finance');
  try {
    await voidSalaryPayment({ id, reason, ...actorOf(session) });
    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return fail(e, 'Could not void the salary payment.');
  }
}

// ------------------------------------------------------------------- float
export async function setFloatAction(input: {
  branchId: string;
  amount: number;
  reason: string;
}): Promise<SimpleResult> {
  const session = await requireModule('finance');
  // A pinned staff member may only change their own branch's float.
  if (session.role !== 'OWNER' && session.branchId && session.branchId !== input.branchId) {
    return { ok: false, error: 'You can only change the float for your own branch.' };
  }
  try {
    await setBranchFloat({ ...input, ...actorOf(session) });
    revalidateFinance();
    return { ok: true };
  } catch (e) {
    return fail(e, 'Could not change the float.');
  }
}
