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
// branch, and so may STAFF who are not pinned to one (the "All branches"
// staff, who pick a branch in the switcher — see getActiveScope). Staff pinned
// to a branch are locked to it. Returns the effective branch id, or null when
// the target is not allowed.
async function writableBranch(session: Session, requested: string | undefined): Promise<string | null> {
  const want = requested?.trim() || null;
  if (session.role === 'OWNER') return want;
  if (session.branchId) {
    // Pinned staff: only their own branch.
    if (want && want !== session.branchId) return null;
    return session.branchId;
  }
  // Unpinned staff: any real branch they name.
  if (!want) return null;
  const exists = await prisma.branch.findUnique({ where: { id: want }, select: { id: true } });
  return exists ? want : null;
}

async function productName(id: string): Promise<string | null> {
  const p = await prisma.product.findUnique({ where: { id }, select: { name: true } });
  return p?.name ?? null;
}

// Receive new stock into a branch (a supplier delivery). Positive qty, with an
// optional per-unit buying price recorded on the movement for later reporting.
// The retail (selling) price is REQUIRED on every receive: it is confirmed or
// updated to the figure entered. The buying price is accountant-level: it is
// only accepted from the owner or a `finance` user (anyone else just receives
// the quantity) and is optional. Whichever of price / cost differs from the
// product's current value is refreshed (latest cost) and the change goes into
// the price history.
export async function receiveStock(input: {
  productId: string;
  branchId: string;
  qty: number;
  price: number;
  unitCost?: number;
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  const mayCost = await canSeeCost(session);
  const branchId = await writableBranch(session, input.branchId);
  if (!branchId) return { ok: false, error: 'Pick a branch you can manage.' };
  const qty = Math.round(Number(input.qty) || 0);
  if (qty <= 0) return { ok: false, error: 'Quantity must be at least 1.' };
  const price = Math.round(Number(input.price) || 0);
  if (price <= 0) return { ok: false, error: 'Enter the retail price.' };
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
      const before = await tx.product.findUniqueOrThrow({
        where: { id: input.productId },
        select: { price: true, cost: true },
      });
      const newCost = unitCost != null && unitCost > 0 ? unitCost : before.cost;
      if (before.price !== price || before.cost !== newCost) {
        await tx.product.update({
          where: { id: input.productId },
          data: { price, cost: newCost },
        });
        await recordPriceChange(tx, {
          productId: input.productId,
          productName: name,
          oldPrice: before.price,
          newPrice: price,
          oldCost: before.cost,
          newCost,
          source: 'RESTOCK',
          note: input.note?.trim() || null,
          userId: session.userId,
          userName: session.name,
        });
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
  const branchId = await writableBranch(session, input.branchId);
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
// Write off expired or damaged units: removes them from stock (oldest batches
// first) and logs a loss at their FIFO cost, which the profit report subtracts.
export async function writeOffStock(input: {
  productId: string;
  branchId: string;
  qty: number;
  reason: 'EXPIRED' | 'DAMAGED';
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  const branchId = await writableBranch(session, input.branchId);
  if (!branchId) return { ok: false, error: 'Pick a branch you can manage.' };
  if (input.reason !== 'EXPIRED' && input.reason !== 'DAMAGED') return { ok: false, error: 'Pick a reason.' };
  const qty = Math.round(Number(input.qty) || 0);
  if (qty <= 0) return { ok: false, error: 'Enter how many units to write off.' };
  const name = await productName(input.productId);
  if (!name) return { ok: false, error: 'Product not found.' };
  try {
    await recordStockChange(prisma, {
      branchId,
      productId: input.productId,
      productName: name,
      delta: -qty,
      type: input.reason,
      note: input.note?.trim() || null,
      userId: session.userId,
      userName: session.name,
    });
    revalidateStock();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not write off stock.' };
  }
}

export async function countStock(input: {
  productId: string;
  branchId: string;
  counted: number;
  note?: string;
}): Promise<SimpleResult> {
  const session = await requireModule('stock');
  const branchId = await writableBranch(session, input.branchId);
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
  const branchId = await writableBranch(session, input.branchId);
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
// For All-branches users only (the owner, or staff not pinned to a branch),
// since it touches two branches at once.
export async function transferStockBatch(input: {
  fromBranchId: string;
  toBranchId: string;
  items: { productId: string; qty: number }[];
  note?: string;
}): Promise<TransferResult> {
  const session = await requireModule('stock');
  if (session.role !== 'OWNER' && session.branchId) {
    return { ok: false, error: 'Only staff with All-branches access can transfer between branches.' };
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
