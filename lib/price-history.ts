// Price-change ledger. Called inside the same transaction that changes a
// product's selling price (`price`) or buying price (`cost`), so the history can
// never disagree with the product row. A no-op when neither value moved.
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export type PriceChangeSource = 'CREATE' | 'EDIT' | 'RESTOCK';

export const PRICE_SOURCE_LABELS: Record<PriceChangeSource, string> = {
  CREATE: 'New product',
  EDIT: 'Edited',
  RESTOCK: 'Stock received',
};

// Serialisable shape of one ledger row, as the Price history table shows it.
export type PriceHistoryRow = {
  id: string;
  productName: string;
  source: string;
  oldPrice: number;
  newPrice: number;
  oldCost: number;
  newCost: number;
  onHandUnits: number;
  note: string | null;
  userName: string | null;
  createdAt: string;
};

// Newest-first price ledger. Takes the db client (like recordPriceChange) so this
// file stays free of the Prisma singleton and safe for client components to import.
export async function loadPriceHistory(db: Db, limit = 200): Promise<PriceHistoryRow[]> {
  const rows = await db.productPriceHistory.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  return rows.map((h) => ({
    id: h.id,
    productName: h.productName,
    source: h.source,
    oldPrice: h.oldPrice,
    newPrice: h.newPrice,
    oldCost: h.oldCost,
    newCost: h.newCost,
    onHandUnits: h.onHandUnits,
    note: h.note,
    userName: h.userName,
    createdAt: h.createdAt.toISOString(),
  }));
}

export async function recordPriceChange(
  db: Db,
  c: {
    productId: string;
    productName: string;
    oldPrice: number;
    newPrice: number;
    oldCost: number;
    newCost: number;
    source: PriceChangeSource;
    note?: string | null;
    userId?: string | null;
    userName?: string | null;
  },
): Promise<boolean> {
  // A brand-new product always gets a baseline row; otherwise skip no-ops.
  const moved = c.oldPrice !== c.newPrice || c.oldCost !== c.newCost;
  if (!moved && c.source !== 'CREATE') return false;

  const onHand = await db.branchStock.aggregate({
    where: { productId: c.productId },
    _sum: { stock: true },
  });

  await db.productPriceHistory.create({
    data: {
      productId: c.productId,
      productName: c.productName,
      oldPrice: c.oldPrice,
      newPrice: c.newPrice,
      oldCost: c.oldCost,
      newCost: c.newCost,
      onHandUnits: onHand._sum.stock ?? 0,
      source: c.source,
      note: c.note ?? null,
      userId: c.userId ?? null,
      userName: c.userName ?? null,
    },
  });
  return true;
}
