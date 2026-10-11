// Stock integrity check. Every change to on-hand stock writes a ledger row with
// the balance it produced (see lib/stock.ts), so the ledger can be replayed and
// compared with the live count. Anything that does not add up is listed here:
//
//   MISMATCH     the live count differs from the last ledger balance — stock was
//                changed without going through the ledger (e.g. edited in the DB)
//   BROKEN_CHAIN a ledger row's starting balance is not the previous row's end
//                balance — a row is missing or was altered
//   NO_HISTORY   stock exists but no movement was ever recorded for it. Normal
//                for stock entered before the ledger existed; informational.
//
// Server-only (uses Prisma) — kept apart from lib/stock.ts, which client code imports.
import { prisma } from './db';

export type StockIssue = {
  kind: 'MISMATCH' | 'BROKEN_CHAIN' | 'NO_HISTORY';
  branchName: string;
  productName: string;
  onHand: number;
  ledger: number | null;
  detail: string;
};

export type StockCheckResult = {
  checked: number; // branch × product rows examined
  problems: StockIssue[]; // MISMATCH / BROKEN_CHAIN
  noHistory: StockIssue[];
};

export async function reconcileStock(): Promise<StockCheckResult> {
  const [stocks, moves] = await Promise.all([
    prisma.branchStock.findMany({
      select: {
        branchId: true,
        productId: true,
        stock: true,
        branch: { select: { name: true } },
        product: { select: { name: true } },
      },
    }),
    prisma.stockMovement.findMany({
      where: { productId: { not: null } },
      orderBy: [{ branchId: 'asc' }, { productId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { branchId: true, productId: true, delta: true, balanceAfter: true },
    }),
  ]);

  const byKey = new Map<string, { delta: number; balanceAfter: number }[]>();
  for (const m of moves) {
    const key = `${m.branchId}:${m.productId}`;
    const list = byKey.get(key);
    if (list) list.push(m);
    else byKey.set(key, [m]);
  }

  const problems: StockIssue[] = [];
  const noHistory: StockIssue[] = [];

  for (const s of stocks) {
    const base = { branchName: s.branch.name, productName: s.product.name, onHand: s.stock };
    const list = byKey.get(`${s.branchId}:${s.productId}`);

    if (!list || list.length === 0) {
      if (s.stock !== 0) {
        noHistory.push({ kind: 'NO_HISTORY', ...base, ledger: null, detail: 'Stock exists but no movement was ever recorded.' });
      }
      continue;
    }

    for (let i = 1; i < list.length; i++) {
      const startedFrom = list[i].balanceAfter - list[i].delta;
      if (startedFrom !== list[i - 1].balanceAfter) {
        problems.push({
          kind: 'BROKEN_CHAIN', ...base, ledger: list[list.length - 1].balanceAfter,
          detail: `Movement ${i + 1} starts from ${startedFrom} but the one before it ended at ${list[i - 1].balanceAfter}.`,
        });
        break; // one chain problem per product is enough to act on
      }
    }

    const last = list[list.length - 1].balanceAfter;
    if (last !== s.stock) {
      problems.push({
        kind: 'MISMATCH', ...base, ledger: last,
        detail: `On hand is ${s.stock} but the history says ${last} (${s.stock - last > 0 ? '+' : ''}${s.stock - last}).`,
      });
    }
  }

  return { checked: stocks.length, problems, noHistory };
}
