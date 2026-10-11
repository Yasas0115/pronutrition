import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

// Default payment methods and their rules. Created on first-run registration
// (and by the seed) and merged into existing databases by migration.
//
//   discountPercent  — auto-applied to retail sales paid this way
//   requiresCustomer — walk-ins may only use methods where this is false
//   allowsPartial    — customer can pay part now, the rest stays owing (credit)
export const DEFAULT_PAYMENT_METHODS = [
  { key: 'CASH', label: 'Cash', discountPercent: 10, requiresCustomer: false, allowsPartial: false, sortOrder: 0 },
  { key: 'CARD', label: 'Card', discountPercent: 7, requiresCustomer: false, allowsPartial: false, sortOrder: 1 },
  { key: 'KOKO', label: 'Koko', discountPercent: 0, requiresCustomer: true, allowsPartial: false, sortOrder: 2 },
  { key: 'BANK', label: 'Bank transfer', discountPercent: 0, requiresCustomer: true, allowsPartial: false, sortOrder: 3 },
  { key: 'CREDIT', label: 'Credit', discountPercent: 0, requiresCustomer: true, allowsPartial: true, sortOrder: 4 },
];

// Methods that can be used to take money when a customer pays down what they
// owe (a credit settlement) or to pay the "paid now" part of a credit sale.
// Koko is a way of financing a purchase, not a way of settling a debt.
export const SETTLEMENT_METHODS = ['CASH', 'CARD', 'BANK'] as const;

// key → label as the owner has named them in Settings (falls back to the
// default name). Reports use this so a renamed method is renamed everywhere.
export async function methodLabels(db: Db): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.fromEntries(
    DEFAULT_PAYMENT_METHODS.map((m) => [m.key, m.label]),
  );
  const rows = await db.paymentMethod.findMany({ select: { key: true, label: true } });
  for (const r of rows) out[r.key] = r.label;
  return out;
}
