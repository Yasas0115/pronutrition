// Core stock mutation helpers. Every change to on-hand stock flows through
// `recordStockChange`, which updates the BranchStock level AND appends a
// StockMovement ledger row in the same transaction, so the count and its audit
// trail can never drift apart. Server actions and checkout call these; nothing
// writes BranchStock.stock directly anymore.
import type { Prisma, PrismaClient } from '@prisma/client';

// A Prisma client OR an interactive-transaction client — both expose the model
// delegates we use, so callers can run these inside their own $transaction.
type Db = PrismaClient | Prisma.TransactionClient;

export type MovementType =
  | 'INITIAL'      // first stock set when a product/branch pairing is stocked
  | 'COUNT'        // absolute stock-take: set on-hand to a counted value
  | 'ADJUST'       // manual +/- correction (damage, theft, gift, fix)
  | 'RESTOCK'      // received new stock from a supplier (carries unitCost)
  | 'SALE'         // sold at the till (negative)
  | 'TRANSFER_IN'  // received from another branch
  | 'TRANSFER_OUT'; // sent to another branch (negative)

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  INITIAL: 'Opening',
  COUNT: 'Stock-take',
  ADJUST: 'Adjustment',
  RESTOCK: 'Received',
  SALE: 'Sale',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
};

export type StockChange = {
  branchId: string;
  productId: string;
  productName: string;
  /** Signed change: positive adds, negative removes. */
  delta: number;
  type: MovementType;
  unitCost?: number | null;
  note?: string | null;
  saleId?: string | null;
  transferId?: string | null;
  userId?: string | null;
  userName?: string | null;
};

/**
 * Apply a signed stock change to (branch, product) and log it.
 * Returns the resulting on-hand balance. Throws if the change would drive
 * on-hand below zero, so callers never have to pre-clamp a removal.
 * A zero delta is a no-op (no ledger noise) and returns the current balance.
 */
export async function recordStockChange(db: Db, c: StockChange): Promise<number> {
  const key = { branchId_productId: { branchId: c.branchId, productId: c.productId } };
  const delta = Math.round(c.delta);
  if (delta === 0) {
    const row = await db.branchStock.findUnique({ where: key, select: { stock: true } });
    return row?.stock ?? 0;
  }

  // Apply the change as an atomic increment in the database (not read-then-
  // write), so two tills selling the same item at once can't both pass a stale
  // stock check and oversell. A removal only matches while enough is on hand.
  if (delta > 0) {
    await db.branchStock.upsert({
      where: key,
      update: { stock: { increment: delta } },
      create: { branchId: c.branchId, productId: c.productId, stock: delta, lowStockAt: 5 },
    });
  } else {
    const res = await db.branchStock.updateMany({
      where: { branchId: c.branchId, productId: c.productId, stock: { gte: -delta } },
      data: { stock: { increment: delta } },
    });
    if (res.count === 0) {
      const row = await db.branchStock.findUnique({ where: key, select: { stock: true } });
      const have = row?.stock ?? 0;
      // `have` can be a stale snapshot if another till just sold the last units.
      throw new Error(
        have >= -delta
          ? `${c.productName} just sold out at this branch — please check stock and try again.`
          : `Not enough stock for ${c.productName} (only ${have} on hand).`,
      );
    }
  }
  const next = (await db.branchStock.findUniqueOrThrow({ where: key, select: { stock: true } })).stock;

  await db.stockMovement.create({
    data: {
      branchId: c.branchId,
      productId: c.productId,
      productName: c.productName,
      type: c.type,
      delta,
      balanceAfter: next,
      unitCost: c.unitCost ?? null,
      note: c.note ?? null,
      saleId: c.saleId ?? null,
      transferId: c.transferId ?? null,
      userId: c.userId ?? null,
      userName: c.userName ?? null,
    },
  });

  return next;
}

/**
 * Set on-hand to an absolute target (a stock-take / count). Computes the delta
 * and records it as COUNT (or INITIAL when the row starts empty). Returns the
 * new balance; a no-change target records nothing.
 */
export async function setStockTo(
  db: Db,
  args: {
    branchId: string;
    productId: string;
    productName: string;
    target: number;
    note?: string | null;
    userId?: string | null;
    userName?: string | null;
  },
): Promise<number> {
  const existing = await db.branchStock.findUnique({
    where: { branchId_productId: { branchId: args.branchId, productId: args.productId } },
    select: { stock: true },
  });
  const current = existing?.stock ?? 0;
  const target = Math.max(0, Math.round(args.target));
  return recordStockChange(db, {
    branchId: args.branchId,
    productId: args.productId,
    productName: args.productName,
    delta: target - current,
    type: existing ? 'COUNT' : 'INITIAL',
    note: args.note,
    userId: args.userId,
    userName: args.userName,
  });
}
