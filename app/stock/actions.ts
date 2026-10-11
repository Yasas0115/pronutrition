'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModule, canSeeCost, hasModule } from '@/lib/auth';
import type { Session } from '@/lib/session';
import { recordStockChange, setStockTo } from '@/lib/stock';
import { recordPriceChange } from '@/lib/price-history';
import { createStockTransfer } from '@/lib/transfers';
import { reconcileStock, type StockCheckResult } from '@/lib/stock-check';
import { revalidateAccounting } from '@/lib/revalidate';

export type SimpleResult = { ok: true } | { ok: false; error: string };

// Stock edits change on-hand counts shown on Stock, Products and the till.
function revalidateStock() {
  revalidatePath('/stock');
  revalidatePath('/products');
  revalidateAccounting();
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
// optional per-unit buying price recorded on the movement for later reporting.
// The buying price is accountant-level: it is only accepted from the owner or a
// `finance` user (anyone else just receives the quantity). When accepted and it
// differs from the product's current cost, the product's `cost` is refreshed
// (latest cost) and the change goes into the price history.
export async function receiveStock(input: {
  productId: string;
  branchId: string;
  qty: number;
  unitCost?: number;
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  const mayCost = await canSeeCost(session);
  const branchId = writableBranch(session, input.branchId);
  if (!branchId) return { ok: false, error: 'Pick a branch you can manage.' };
  const qty = Math.round(Number(input.qty) || 0);
  if (qty <= 0) return { ok: false, error: 'Quantity must be at least 1.' };
  const name = await productName(input.productId);
  if (!name) return { ok: false, error: 'Product not found.' };
  const unitCost =
    mayCost && input.unitCost != null ? Math.max(0, Math.round(input.unitCost)) : null;
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
        const before = await tx.product.findUniqueOrThrow({
          where: { id: input.productId },
          select: { price: true, cost: true },
        });
        if (before.cost !== unitCost) {
          await tx.product.update({ where: { id: input.productId }, data: { cost: unitCost } });
          await recordPriceChange(tx, {
            productId: input.productId,
            productName: name,
            oldPrice: before.price,
            newPrice: before.price,
            oldCost: before.cost,
            newCost: unitCost,
            source: 'RESTOCK',
            note: input.note?.trim() || null,
            userId: session.userId,
            userName: session.name,
          });
        }
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

export type TransferResult =
  | { ok: true; id: string; number: number }
  | { ok: false; error: string };

// Move stock between two branches as ONE numbered document (TRF-1001) carrying
// any number of products. Every line is a TRANSFER_OUT at the sender (checked
// against on-hand) and a TRANSFER_IN at the receiver, and the whole document is
// a single transaction — all lines move or none do (lib/transfers.ts).
// Owner-only, since it touches two branches at once.
export async function transferStockBatch(input: {
  fromBranchId: string;
  toBranchId: string;
  items: { productId: string; qty: number }[];
  note?: string;
}): Promise<TransferResult> {
  const session = await requireModule('stock');
  if (session.role !== 'OWNER') {
    return { ok: false, error: 'Only an owner can transfer between branches.' };
  }
  try {
    const r = await createStockTransfer({
      fromBranchId: input.fromBranchId,
      toBranchId: input.toBranchId,
      items: input.items,
      note: input.note,
      userId: session.userId,
      userName: session.name,
    });
    revalidateStock();
    return { ok: true, id: r.id, number: r.number };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not transfer stock.' };
  }
}

// Kept for older callers: a one-product transfer is just a one-line document.
export async function transferStock(input: {
  productId: string;
  fromBranchId: string;
  toBranchId: string;
  qty: number;
  note?: string;
}): Promise<SimpleResult> {
  const res = await transferStockBatch({
    fromBranchId: input.fromBranchId,
    toBranchId: input.toBranchId,
    items: [{ productId: input.productId, qty: input.qty }],
    note: input.note,
  });
  return res.ok ? { ok: true } : res;
}

// Replays the movement ledger and compares it with the live counts. For the
// owner and anyone with the Accounts & finance module.
export async function stockCheckAction(): Promise<
  { ok: true; result: StockCheckResult } | { ok: false; error: string }
> {
  const session = await requireModule('stock');
  if (session.role !== 'OWNER' && !(await hasModule(session, 'finance'))) {
    return { ok: false, error: 'Only the owner or an accountant can run the stock check.' };
  }
  try {
    return { ok: true, result: await reconcileStock() };
  } catch {
    return { ok: false, error: 'Could not run the stock check.' };
  }
}
