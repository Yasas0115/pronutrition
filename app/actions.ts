'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { requireSession, setSessionCookie, clearSessionCookie } from '@/lib/auth';
import { normalizeRole } from '@/lib/session';
import {
  getTillBranchId,
  setActiveScopeCookie,
  ALL_BRANCHES,
  parseModules,
  type ModuleKey,
} from '@/lib/branch';
import { performCheckout, type Receipt } from '@/lib/checkout';
import { DEFAULT_PAYMENT_METHODS } from '@/lib/payment-methods';

export type { Receipt } from '@/lib/checkout';

// ---------- Auth ----------
export type LoginResult = { ok: true } | { ok: false; error: string };

export async function loginAction(
  _prev: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { ok: false, error: 'Enter email and password.' };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name ?? user.email,
    role: normalizeRole(user.role),
    branchId: user.branchId ?? null,
  });
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}

// ---------- Registration (first-run company setup) ----------
export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerAction(
  _prev: RegisterResult | null,
  formData: FormData,
): Promise<RegisterResult> {
  // Only allowed while the app is unclaimed (no owner yet).
  const ownerCount = await prisma.user.count({ where: { role: 'OWNER' } });
  if (ownerCount > 0) return { ok: false, error: 'This installation is already set up. Please sign in.' };

  const company = String(formData.get('company') ?? '').trim();
  const branchName = String(formData.get('branch') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const modules = formData.getAll('modules').map(String) as ModuleKey[];

  if (!company) return { ok: false, error: 'Enter a company name.' };
  if (!branchName) return { ok: false, error: 'Enter your first branch name.' };
  if (!email || !password) return { ok: false, error: 'Enter an email and password.' };
  if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };

  const enabled = Array.from(parseModules(modules.join(','))).join(',');

  try {
    const store = await prisma.store.findFirst();
    if (store) await prisma.store.update({ where: { id: store.id }, data: { name: company, enabledModules: enabled } });
    else
      await prisma.store.create({
        data: { name: company, enabledModules: enabled, receiptNote: 'Thank you — stay strong!' },
      });

    await prisma.branch.create({ data: { name: branchName, active: true } });

    // Fresh database: give checkout its default payment methods + discounts.
    if ((await prisma.paymentMethod.count()) === 0) {
      await prisma.paymentMethod.createMany({ data: DEFAULT_PAYMENT_METHODS });
    }

    const owner = await prisma.user.create({
      data: { email, name: name || 'Owner', role: 'OWNER', branchId: null, passwordHash: hashPassword(password) },
    });

    await setSessionCookie({
      userId: owner.id,
      email: owner.email,
      name: owner.name ?? owner.email,
      role: 'OWNER',
      branchId: null,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not complete setup. That email may already be in use.' };
  }
}

// ---------- Branch switching (owner) ----------
export async function switchBranchAction(scope: string): Promise<void> {
  const session = await requireSession();
  if (session.role !== 'OWNER') return; // cashiers are locked to their branch
  await setActiveScopeCookie(scope || ALL_BRANCHES);
  revalidatePath('/', 'layout');
}

// ---------- Checkout ----------
export type CartLine = { productId: string; qty: number };

export type CheckoutInput = {
  items: CartLine[];
  manualDiscount: number;
  method: string;
  paid: number;
  customerName?: string;
};

export type CheckoutResult =
  | { ok: true; receipt: Receipt }
  | { ok: false; error: string };

export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  const session = await requireSession();
  const branchId = await getTillBranchId(session);
  if (!branchId) return { ok: false, error: 'No branch is available. Ask the owner to open a branch.' };
  try {
    const receipt = await performCheckout({
      items: input.items,
      manualDiscount: input.manualDiscount,
      method: input.method,
      paid: input.paid,
      customerName: input.customerName,
      branchId,
      cashierId: session.userId,
      cashierName: session.name,
    });
    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/sales');
    return { ok: true, receipt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Checkout failed.' };
  }
}
