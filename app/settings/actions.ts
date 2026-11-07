'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { parseModules } from '@/lib/branch';
import { logAudit, diffFields } from '@/lib/audit';
import { revalidateAccounting } from '@/lib/revalidate';

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
  const session = await requireOwner();
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
    if (existing) {
      const saved = await prisma.store.update({ where: { id: existing.id }, data });
      const pick = (s: typeof existing) => ({
        name: s.name, currency: s.currency, phone: s.phone, address: s.address,
        receiptNote: s.receiptNote, taxPercent: s.taxPercent,
        // The logo is a big data: URL — log only that it changed, not the bytes.
        logo: s.logoUrl ? 'set' : 'none',
      });
      const { before, after, changed } = diffFields(pick(existing), pick(saved));
      if (changed.length > 0) {
        await logAudit(prisma, {
          entity: 'SETTINGS',
          entityId: existing.id,
          action: 'UPDATE',
          summary: `Changed store settings — ${changed.join(', ')}`,
          before,
          after,
          userId: session.userId,
          userName: session.name,
        });
      }
    } else {
      await prisma.store.create({ data: data as never });
    }

    revalidatePath('/settings');
    revalidatePath('/');
    revalidatePath('/products');
    revalidateAccounting();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save settings.' };
  }
}

// ---------- Enabled modules ----------
export async function saveModules(modules: string[]): Promise<StoreResult> {
  await requireOwner();
  // (Module switches are not audited: access is controlled per user, and those
  // edits are logged from the Staff page.)
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
  const session = await requireOwner();
  try {
    for (const m of list) {
      const prev = await prisma.paymentMethod.findUnique({
        where: { key: m.key },
        select: { label: true, discountPercent: true },
      });
      const next = {
        label: m.label.trim() || m.key,
        discountPercent: Math.max(0, Math.min(100, Math.round(m.discountPercent || 0))),
      };
      await prisma.paymentMethod.update({ where: { key: m.key }, data: next });
      if (prev) {
        const { before, after, changed } = diffFields(prev, next);
        if (changed.length > 0) {
          await logAudit(prisma, {
            entity: 'SETTINGS',
            entityId: m.key,
            action: 'UPDATE',
            summary: `Changed payment method ${m.key} — ${changed.join(', ')}`,
            before,
            after,
            userId: session.userId,
            userName: session.name,
          });
        }
      }
    }
    revalidatePath('/settings');
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save payment methods.' };
  }
}

// Add / remove payment methods. The five built-ins drive checkout rules (cash
// change, credit, settlements) so they can be edited but not removed.
const CORE_METHODS = new Set(['CASH', 'CARD', 'KOKO', 'BANK', 'CREDIT']);

export async function addPaymentMethod(input: {
  label: string;
  discountPercent: number;
  requiresCustomer: boolean;
}): Promise<StoreResult> {
  const session = await requireOwner();
  const label = input.label.trim().slice(0, 40);
  if (!label) return { ok: false, error: 'Enter a name for the payment method.' };
  const discountPercent = Math.max(0, Math.min(100, Math.round(input.discountPercent || 0)));
  const key = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'METHOD';
  try {
    const existing = await prisma.paymentMethod.findUnique({ where: { key } });
    if (existing?.active) return { ok: false, error: `A payment method called "${existing.label}" already exists.` };
    const last = await prisma.paymentMethod.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const data = {
      label, discountPercent, requiresCustomer: input.requiresCustomer, allowsPartial: false,
      active: true, sortOrder: (last?.sortOrder ?? 0) + 1,
    };
    if (existing) await prisma.paymentMethod.update({ where: { key }, data });
    else await prisma.paymentMethod.create({ data: { key, ...data } });
    await logAudit(prisma, {
      entity: 'SETTINGS', entityId: key, action: 'CREATE',
      summary: `Added payment method ${label} (${discountPercent}% discount)`,
      userId: session.userId, userName: session.name,
    });
    revalidatePath('/settings');
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not add the payment method.' };
  }
}

export async function removePaymentMethod(key: string): Promise<StoreResult> {
  const session = await requireOwner();
  if (CORE_METHODS.has(key)) return { ok: false, error: 'Built-in payment methods cannot be removed.' };
  try {
    const pm = await prisma.paymentMethod.findUnique({ where: { key } });
    if (!pm) return { ok: true };
    // Past sales keep this key, so hide it instead of deleting when it was used.
    const used = await prisma.sale.count({ where: { method: key } });
    if (used > 0) await prisma.paymentMethod.update({ where: { key }, data: { active: false } });
    else await prisma.paymentMethod.delete({ where: { key } });
    await logAudit(prisma, {
      entity: 'SETTINGS', entityId: key, action: 'DELETE',
      summary: `Removed payment method ${pm.label}`,
      userId: session.userId, userName: session.name,
    });
    revalidatePath('/settings');
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not remove the payment method.' };
  }
}

// ---------- Seasonal discounts ----------
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function addPromotion(input: {
  name: string;
  percent: number;
  startsOn: string;
  endsOn: string;
}): Promise<StoreResult> {
  const session = await requireOwner();
  const name = input.name.trim().slice(0, 60);
  const percent = Math.round(input.percent || 0);
  if (!name) return { ok: false, error: 'Enter a name for the seasonal discount.' };
  if (percent < 1 || percent > 100) return { ok: false, error: 'Discount must be between 1% and 100%.' };
  const startsOn = DAY.test(input.startsOn) ? input.startsOn : null;
  const endsOn = DAY.test(input.endsOn) ? input.endsOn : null;
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false, error: 'The end date is before the start date.' };
  try {
    const p = await prisma.promotion.create({ data: { name, percent, startsOn, endsOn } });
    await logAudit(prisma, {
      entity: 'SETTINGS', entityId: p.id, action: 'CREATE',
      summary: `Added seasonal discount ${name} (${percent}%${startsOn ? ` from ${startsOn}` : ''}${endsOn ? ` to ${endsOn}` : ''})`,
      userId: session.userId, userName: session.name,
    });
    revalidatePath('/settings');
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not add the seasonal discount.' };
  }
}

export async function setPromotionActive(id: string, active: boolean): Promise<StoreResult> {
  const session = await requireOwner();
  try {
    const p = await prisma.promotion.update({ where: { id }, data: { active } });
    await logAudit(prisma, {
      entity: 'SETTINGS', entityId: id, action: 'UPDATE',
      summary: `Seasonal discount ${p.name} switched ${active ? 'on' : 'off'}`,
      before: { active: !active }, after: { active },
      userId: session.userId, userName: session.name,
    });
    revalidatePath('/settings');
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update the seasonal discount.' };
  }
}

export async function removePromotion(id: string): Promise<StoreResult> {
  const session = await requireOwner();
  try {
    const p = await prisma.promotion.findUnique({ where: { id } });
    if (!p) return { ok: true };
    await prisma.promotion.delete({ where: { id } });
    await logAudit(prisma, {
      entity: 'SETTINGS', entityId: id, action: 'DELETE',
      summary: `Removed seasonal discount ${p.name} (${p.percent}%)`,
      userId: session.userId, userName: session.name,
    });
    revalidatePath('/settings');
    revalidatePath('/');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not remove the seasonal discount.' };
  }
}
