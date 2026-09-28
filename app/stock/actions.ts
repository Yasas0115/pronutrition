'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModule } from '@/lib/auth';
import type { Session } from '@/lib/session';
import { recordStockChange, setStockTo } from '@/lib/stock';

export type SimpleResult = { ok: true } | { ok: false; error: string };

// Stock edits change on-hand counts shown on Stock, Products and the till.
function revalidateStock() {
  revalidatePath('/stock');
  revalidatePath('/products');
  revalidatePath('/');
}

// Which branch a given person may write stock to. An OWNER may target any
// branch; a STAFF member is locked to the branch they are pinned to. Returns
// the effective branch id, or null when the target is not allowed.
function writableBranch(session: Session, requested: string | undefined): string | null {
  if (session.role === 'OWNER') return requested?.trim() || null;
  // Staff: ignore any requested branch and use their own pinned branch.
  if (!session.branchId) return null;
  if (requested && requested !== session.branchId) return null;
  return session.branchId;
}

async function productName(id: string): Promise<string | null> {
  const p = await prisma.product.findUnique({ where: { id }, select: { name: true } });
  return p?.name ?? null;
}

// Receive new stock into a branch (a supplier delivery). Positive qty, with an
// optional per-unit cost recorded on the movement for later reporting. When a
// cost is given it also refreshes the product's `cost` (latest cost).
export async function receiveStock(input: {
  productId: string;
  branchId: string;
  qty: number;
  unitCost?: number;
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  const branchId = writableBranch(session, input.branchId);
  if (!branchId) return { ok: false, error: 'Pick a branch you can manage.' };
  const qty = Math.round(Number(input.qty) || 0);
  if (qty <= 0) return { ok: false, error: 'Quantity must be at least 1.' };
  const name = await productName(input.productId);
  if (!name) return { ok: false, error: 'Product not found.' };
  const unitCost =
    input.unitCost != null ? Math.max(0, Math.round(input.unitCost)) : null;
  try {
    await prisma.$transaction(async (tx) => {
      await recordStockChange(tx, {
        branchId,
        productId: input.productId,
        productName: name,
        delta: qty,
        type: 'RESTOCK',
        unitCost,
        note: input.note?.trim() || null,
        userId: session.userId,
        userName: session.name,
      });
      if (unitCost != null && unitCost > 0) {
        await tx.product.update({ where: { id: input.productId }, data: { cost: unitCost } });
      }
    });
    revalidateStock();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not receive stock.' };
  }
}

// Manual +/- correction (damage, theft, gift, fix), with a reason on the ledger.
export async function adjustStockManual(input: {
  productId: string;
  branchId: string;
  delta: number;
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  const branchId = writableBranch(session, input.branchId);
  if (!branchId) return { ok: false, error: 'Pick a branch you can manage.' };
  const delta = Math.round(Number(input.delta) || 0);
  if (delta === 0) return { ok: false, error: 'Enter a non-zero adjustment.' };
  const name = await productName(input.productId);
  if (!name) return { ok: false, error: 'Product not found.' };
  try {
    await recordStockChange(prisma, {
      branchId,
      productId: input.productId,
      productName: name,
      delta,
      type: 'ADJUST',
      note: input.note?.trim() || null,
      userId: session.userId,
      userName: session.name,
    });
    revalidateStock();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not adjust stock.' };
  }
}

// Set on-hand to a counted value (a stock-take).
export async function countStock(input: {
  productId: string;
  branchId: string;
  counted: number;
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  const branchId = writableBranch(session, input.branchId);
  if (!branchId) return { ok: false, error: 'Pick a branch you can manage.' };
  const name = await productName(input.productId);
  if (!name) return { ok: false, error: 'Product not found.' };
  try {
    await setStockTo(prisma, {
      branchId,
      productId: input.productId,
      productName: name,
      target: Number(input.counted) || 0,
      note: input.note?.trim() || 'Stock-take',
      userId: session.userId,
      userName: session.name,
    });
    revalidateStock();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the count.' };
  }
}

// Update the low-stock threshold for a product at a branch.
export async function setLowStockAt(input: {
  productId: string;
  branchId: string;
  value: number;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  const branchId = writableBranch(session, input.branchId);
  if (!branchId) return { ok: false, error: 'Pick a branch you can manage.' };
  const lowStockAt = Math.max(0, Math.round(Number(input.value) || 0));
  try {
    await prisma.branchStock.upsert({
      where: { branchId_productId: { branchId, productId: input.productId } },
      update: { lowStockAt },
      create: { branchId, productId: input.productId, stock: 0, lowStockAt },
    });
    revalidateStock();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update the threshold.' };
  }
}

// Move stock between two branches. Runs both legs as one transaction: a
// TRANSFER_OUT from the source (validated against on-hand) and a TRANSFER_IN to
// the destination, tied together by a shared transferId. Owner-only, since it
// touches two branches at once.
export async function transferStock(input: {
  productId: string;
  fromBranchId: string;
  toBranchId: string;
  qty: number;
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  if (session.role !== 'OWNER') {
    return { ok: false, error: 'Only an owner can transfer between branches.' };
  }
  const qty = Math.round(Number(input.qty) || 0);
  if (qty <= 0) return { ok: false, error: 'Quantity must be at least 1.' };
  if (!input.fromBranchId || !input.toBranchId) return { ok: false, error: 'Pick both branches.' };
  if (input.fromBranchId === input.toBranchId) {
    return { ok: false, error: 'Source and destination must differ.' };
  }
  const name = await productName(input.productId);
  if (!name) return { ok: false, error: 'Product not found.' };
  const transferId = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      const [from, to] = await Promise.all([
        tx.branch.findUnique({ where: { id: input.fromBranchId }, select: { name: true } }),
        tx.branch.findUnique({ where: { id: input.toBranchId }, select: { name: true } }),
      ]);
      if (!from || !to) throw new Error('A selected branch no longer exists.');
      // OUT first so the on-hand guard rejects an over-transfer before crediting.
      await recordStockChange(tx, {
        branchId: input.fromBranchId,
        productId: input.productId,
        productName: name,
        delta: -qty,
        type: 'TRANSFER_OUT',
        transferId,
        note: input.note?.trim() || `To ${to.name}`,
        userId: session.userId,
        userName: session.name,
      });
      await recordStockChange(tx, {
        branchId: input.toBranchId,
        productId: input.productId,
        productName: name,
        delta: qty,
        type: 'TRANSFER_IN',
        transferId,
        note: input.note?.trim() || `From ${from.name}`,
        userId: session.userId,
        userName: session.name,
      });
    });
    revalidateStock();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not transfer stock.' };
  }
}
