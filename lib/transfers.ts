// Stock transfers between branches. One numbered document (TRF-1001) can carry
// many products; the whole thing is a single transaction, so either every line
// moves or none does.
//
// Each line is a pair of ledger rows sharing the document's id as `transferId`:
//   TRANSFER_OUT at the sending branch  (delta −qty, with its new balance)
//   TRANSFER_IN  at the receiving branch (delta +qty, with its new balance)
// The ledger therefore always shows both sides' before/after balances, and the
// two legs of a line always cancel out exactly (total stock is conserved).
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { recordStockChange } from './stock';
import { logAudit } from './audit';
import { transferLabel, type TransferLine, type TransferRow } from './transfer-types';

export { transferLabel };
export type { TransferLine, TransferRow };

export type TransferItemInput = { productId: string; qty: number };

export type NewTransfer = {
  fromBranchId: string;
  toBranchId: string;
  items: TransferItemInput[];
  note?: string | null;
  userId: string | null;
  userName: string | null;
};

const MAX_LINES = 100;

export async function createStockTransfer(input: NewTransfer): Promise<{ id: string; number: number; lines: TransferLine[] }> {
  if (!input.fromBranchId || !input.toBranchId) throw new Error('Pick both branches.');
  if (input.fromBranchId === input.toBranchId) throw new Error('Source and destination must differ.');

  // Same product twice on one transfer is one line with the quantities added.
  const merged = new Map<string, number>();
  for (const it of input.items ?? []) {
    const q = Math.round(Number(it.qty) || 0);
    if (!it.productId) continue;
    if (q <= 0) throw new Error('Every quantity must be at least 1.');
    merged.set(it.productId, (merged.get(it.productId) ?? 0) + q);
  }
  if (merged.size === 0) throw new Error('Add at least one product to transfer.');
  if (merged.size > MAX_LINES) throw new Error(`A transfer can carry up to ${MAX_LINES} products.`);

  // The document number is max+1; if two transfers race for the same number the
  // unique index rejects one and it simply tries again.
  for (let attempt = 0; ; attempt++) {
    try {
      return await transferOnce(input, merged);
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (!clash || attempt >= 4) throw e;
    }
  }
}

function transferOnce(input: NewTransfer, merged: Map<string, number>) {
  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.branch.findUnique({ where: { id: input.fromBranchId }, select: { id: true, name: true } }),
      tx.branch.findUnique({ where: { id: input.toBranchId }, select: { id: true, name: true, active: true } }),
    ]);
    if (!from || !to) throw new Error('A selected branch no longer exists.');
    if (!to.active) throw new Error(`${to.name} is closed — pick an open branch to receive the stock.`);

    const ids = Array.from(merged.keys());
    const products = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nameOf = new Map(products.map((p) => [p.id, p.name]));
    if (products.length !== ids.length) throw new Error('A product on this transfer no longer exists.');

    const last = await tx.stockTransfer.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const number = (last?.number ?? 1000) + 1;
    const id = randomUUID();
    const note = input.note?.trim() || null;

    await tx.stockTransfer.create({
      data: {
        id, number,
        fromBranchId: from.id, fromBranchName: from.name,
        toBranchId: to.id, toBranchName: to.name,
        note, userId: input.userId, userName: input.userName,
      },
    });

    const lines: TransferLine[] = [];
    for (const [productId, qty] of merged) {
      const productName = nameOf.get(productId)!;
      // OUT first: the on-hand guard rejects an over-transfer before anything is credited.
      const fromAfter = await recordStockChange(tx, {
        branchId: from.id, productId, productName, delta: -qty, type: 'TRANSFER_OUT',
        transferId: id, note: note ?? `To ${to.name} · ${transferLabel(number)}`,
        userId: input.userId, userName: input.userName,
      });
      const toAfter = await recordStockChange(tx, {
        branchId: to.id, productId, productName, delta: qty, type: 'TRANSFER_IN',
        transferId: id, note: note ?? `From ${from.name} · ${transferLabel(number)}`,
        userId: input.userId, userName: input.userName,
      });
      lines.push({ productName, qty, fromBefore: fromAfter + qty, fromAfter, toBefore: toAfter - qty, toAfter });
    }

    await logAudit(tx, {
      entity: 'STOCK',
      entityId: id,
      action: 'CREATE',
      summary: `Transfer ${transferLabel(number)} — ${lines.length} product${lines.length === 1 ? '' : 's'}, ${from.name} → ${to.name}`,
      after: { units: lines.reduce((n, l) => n + l.qty, 0) },
      branchId: from.id,
      userId: input.userId,
      userName: input.userName,
    });

    return { id, number, lines };
  });
}

// ------------------------------------------------------------------ listing
// Rebuilt from the movement ledger, so transfers made before documents existed
// show up too (just without a number).
export async function listTransfers(limit = 60): Promise<TransferRow[]> {
  const moves = await prisma.stockMovement.findMany({
    where: { transferId: { not: null }, type: { in: ['TRANSFER_OUT', 'TRANSFER_IN'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit * 40,
  });
  if (moves.length === 0) return [];

  const ids = Array.from(new Set(moves.map((m) => m.transferId as string)));
  const [headers, branches] = await Promise.all([
    prisma.stockTransfer.findMany({ where: { id: { in: ids } } }),
    prisma.branch.findMany({ select: { id: true, name: true } }),
  ]);
  const headerOf = new Map(headers.map((h) => [h.id, h]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const rows: TransferRow[] = [];
  for (const tid of ids) {
    const legs = moves.filter((m) => m.transferId === tid);
    const outs = legs.filter((m) => m.type === 'TRANSFER_OUT');
    const ins = legs.filter((m) => m.type === 'TRANSFER_IN');
    const h = headerOf.get(tid);
    const first = legs[legs.length - 1]; // oldest (list is newest-first)

    const lines: TransferLine[] = outs.map((o) => {
      const i = ins.find((x) => x.productId === o.productId);
      return {
        productName: o.productName,
        qty: -o.delta,
        fromBefore: o.balanceAfter - o.delta,
        fromAfter: o.balanceAfter,
        toBefore: i ? i.balanceAfter - i.delta : 0,
        toAfter: i ? i.balanceAfter : 0,
      };
    });

    rows.push({
      id: tid,
      number: h?.number ?? null,
      createdAt: (h?.createdAt ?? first.createdAt).toISOString(),
      fromBranchName: h?.fromBranchName ?? branchName.get(outs[0]?.branchId ?? '') ?? '—',
      toBranchName: h?.toBranchName ?? branchName.get(ins[0]?.branchId ?? '') ?? '—',
      note: h?.note ?? null,
      userName: h?.userName ?? first.userName,
      lines,
    });
  }
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}
