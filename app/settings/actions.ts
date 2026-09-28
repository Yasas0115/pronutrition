'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { parseModules } from '@/lib/branch';

export type StoreInput = {
  name: string;
  currency: string;
  phone?: string;
  address?: string;
  receiptNote?: string;
  taxPercent: number;
  logoUrl?: string | null; // data: URL, or null to clear, or undefined to keep
};

export type StoreResult = { ok: true } | { ok: false; error: string };

export async function saveStore(input: StoreInput): Promise<StoreResult> {
  await requireOwner();
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Store name is required.' };
  if (input.logoUrl && input.logoUrl.length > 700_000) {
    return { ok: false, error: 'Logo image is too large.' };
  }

  const data: Record<string, unknown> = {
    name,
    currency: input.currency.trim() || 'Rs',
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    receiptNote: input.receiptNote?.trim() || null,
    taxPercent: Math.max(0, Math.min(100, Math.round(input.taxPercent || 0))),
  };
  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;

  try {
    const existing = await prisma.store.findFirst();
    if (existing) await prisma.store.update({ where: { id: existing.id }, data });
    else await prisma.store.create({ data: data as never });

    revalidatePath('/settings');
    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/sales');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save settings.' };
  }
}

// ---------- Enabled modules ----------
export async function saveModules(modules: string[]): Promise<StoreResult> {
  await requireOwner();
  const enabled = Array.from(parseModules(modules.join(','))).join(',');
  try {
    const existing = await prisma.store.findFirst();
    if (existing) await prisma.store.update({ where: { id: existing.id }, data: { enabledModules: enabled } });
    else await prisma.store.create({ data: { enabledModules: enabled } as never });
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save modules.' };
  }
}

// ---------- Payment method discounts ----------
export type PaymentMethodInput = { key: string; label: string; discountPercent: number };

export async function savePaymentMethods(list: PaymentMethodInput[]): Promise<StoreResult> {
  await requireOwner();
  try {
    for (const m of list) {
      await prisma.paymentMethod.update({
        where: { key: m.key },
        data: {
          label: m.label.trim() || m.key,
          discountPercent: Math.max(0, Math.min(100, Math.round(m.discountPercent || 0))),
        },
      });
    }
    revalidatePath('/settings');
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save payment methods.' };
  }
}
