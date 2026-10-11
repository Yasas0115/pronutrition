// Integration check for Phase 4 (transfers): a multi-product transfer moves
// exactly what it says out of one branch and into the other, conserves the
// total, writes before/after balances on both sides, is all-or-nothing, and the
// stock check catches a count that no longer matches its history.
// Run: pnpm exec tsx scripts/verify-transfer.ts
import { prisma } from '../lib/db';
import { recordStockChange } from '../lib/stock';
import { createStockTransfer, listTransfers } from '../lib/transfers';
import { reconcileStock } from '../lib/stock-check';
import { setupFixtures, assert, rejects, stockAt, failureCount } from './fixtures';

async function main() {
  const f = await setupFixtures({
    products: [
      { name: 'VERIFY Whey', price: 5000, cost: 3000, stock: 20 },
      { name: 'VERIFY Bar', price: 400, cost: 250, stock: 10 },
    ],
  });
  const [whey, bar] = f.products;
  const A = f.branch; // sender: whey 20, bar 10
  const B = await f.makeBranch('B'); // receiver
  const actor = { userId: null, userName: 'Verifier' };

  await recordStockChange(prisma, { branchId: B.id, productId: whey.id, productName: whey.name, delta: 5, type: 'INITIAL', ...actor });
  await recordStockChange(prisma, { branchId: B.id, productId: bar.id, productName: bar.name, delta: 0, type: 'INITIAL', ...actor });

  const total = async (id: string) => (await stockAt(A.id, id)) + (await stockAt(B.id, id));
  const transferCount = () => prisma.stockTransfer.count({ where: { fromBranchId: A.id } });
  const moveCount = () => prisma.stockMovement.count({ where: { branchId: { in: [A.id, B.id] }, type: { in: ['TRANSFER_OUT', 'TRANSFER_IN'] } } });

  try {
    // ------------------------------------------------------ happy path
    console.log('\n▶ Multi-product transfer A → B');
    const wheyTotal0 = await total(whey.id);
    const barTotal0 = await total(bar.id);
    const t1 = await createStockTransfer({
      fromBranchId: A.id, toBranchId: B.id, note: 'Weekly top-up', ...actor,
      items: [{ productId: whey.id, qty: 8 }, { productId: bar.id, qty: 4 }],
    });
    assert(t1.number > 1000, `document number assigned (TRF-${t1.number})`);
    assert((await stockAt(A.id, whey.id)) === 12 && (await stockAt(B.id, whey.id)) === 13, 'whey: A 20 → 12, B 5 → 13');
    assert((await stockAt(A.id, bar.id)) === 6 && (await stockAt(B.id, bar.id)) === 4, 'bar: A 10 → 6, B 0 → 4');
    assert((await total(whey.id)) === wheyTotal0 && (await total(bar.id)) === barTotal0, 'total stock is conserved (plus and minus cancel exactly)');

    const wl = t1.lines.find((l) => l.productName === whey.name)!;
    assert(wl.fromBefore === 20 && wl.fromAfter === 12 && wl.toBefore === 5 && wl.toAfter === 13,
      'result carries before → after for both branches (20→12 / 5→13)');

    const legs = await prisma.stockMovement.findMany({ where: { transferId: t1.id } });
    assert(legs.length === 4, 'four ledger rows share the transfer id (2 products × OUT + IN)');
    const outs = legs.filter((l) => l.type === 'TRANSFER_OUT');
    const ins = legs.filter((l) => l.type === 'TRANSFER_IN');
    assert(outs.length === 2 && outs.every((l) => l.branchId === A.id && l.delta < 0), 'OUT legs are negative and at the sender');
    assert(ins.length === 2 && ins.every((l) => l.branchId === B.id && l.delta > 0), 'IN legs are positive and at the receiver');
    assert(legs.reduce((n, l) => n + l.delta, 0) === 0, 'all legs of the document sum to zero');
    assert(outs.every((l) => ins.some((i) => i.productId === l.productId && i.delta === -l.delta)), 'each OUT has an exactly matching IN');

    const header = await prisma.stockTransfer.findUniqueOrThrow({ where: { id: t1.id } });
    assert(header.fromBranchName === A.name && header.toBranchName === B.name && header.note === 'Weekly top-up' && header.userName === 'Verifier',
      'header snapshots both branch names, the note and who sent it');

    const listed = (await listTransfers(50)).find((t) => t.id === t1.id);
    assert(!!listed && listed.number === t1.number && listed.lines.length === 2, 'the Transfers tab data lists it with 2 lines');
    const lw = listed?.lines.find((l) => l.productName === whey.name);
    assert(lw?.fromBefore === 20 && lw.fromAfter === 12 && lw.toBefore === 5 && lw.toAfter === 13,
      'listing rebuilds before/after balances for both sides from the ledger');

    // ------------------------------------------------ rules / atomicity
    console.log('\n▶ Rules and all-or-nothing');
    const docs0 = await transferCount();
    const moves0 = await moveCount();
    assert(await rejects(() => createStockTransfer({
      fromBranchId: A.id, toBranchId: B.id, ...actor,
      items: [{ productId: bar.id, qty: 1 }, { productId: whey.id, qty: 999 }], // 2nd line is impossible
    }), 'not enough'), 'a transfer with one impossible line is rejected');
    assert((await stockAt(A.id, bar.id)) === 6 && (await stockAt(B.id, bar.id)) === 4, 'the valid line did NOT move either (nothing partial)');
    assert((await transferCount()) === docs0 && (await moveCount()) === moves0, 'no document and no ledger rows were left behind');

    assert(await rejects(() => createStockTransfer({ fromBranchId: A.id, toBranchId: A.id, items: [{ productId: bar.id, qty: 1 }], ...actor }), 'differ'),
      'sender and receiver must differ');
    assert(await rejects(() => createStockTransfer({ fromBranchId: A.id, toBranchId: B.id, items: [], ...actor }), 'at least one'), 'an empty transfer is rejected');
    assert(await rejects(() => createStockTransfer({ fromBranchId: A.id, toBranchId: B.id, items: [{ productId: bar.id, qty: 0 }], ...actor }), 'at least 1'),
      'a zero quantity is rejected');

    await prisma.branch.update({ where: { id: B.id }, data: { active: false } });
    assert(await rejects(() => createStockTransfer({ fromBranchId: A.id, toBranchId: B.id, items: [{ productId: bar.id, qty: 1 }], ...actor }), 'closed'),
      'a closed branch cannot receive stock');
    await prisma.branch.update({ where: { id: B.id }, data: { active: true } });

    // --------------------------------------------- merge + numbering
    console.log('\n▶ Same product twice, and consecutive numbers');
    const t2 = await createStockTransfer({
      fromBranchId: A.id, toBranchId: B.id, ...actor,
      items: [{ productId: bar.id, qty: 2 }, { productId: bar.id, qty: 3 }],
    });
    assert(t2.lines.length === 1 && t2.lines[0].qty === 5, 'the same product on two rows becomes one line of 5');
    assert(t2.number === t1.number + 1, `next document is TRF-${t1.number + 1} (got ${t2.number})`);
    assert((await stockAt(A.id, bar.id)) === 1 && (await stockAt(B.id, bar.id)) === 9, 'bar: A 6 → 1, B 4 → 9');

    // And back the other way: B → A.
    const t3 = await createStockTransfer({ fromBranchId: B.id, toBranchId: A.id, items: [{ productId: whey.id, qty: 13 }], ...actor });
    assert((await stockAt(B.id, whey.id)) === 0 && (await stockAt(A.id, whey.id)) === 25, 'moving all of a product back leaves 0 at the sender');
    assert(await rejects(() => createStockTransfer({ fromBranchId: B.id, toBranchId: A.id, items: [{ productId: whey.id, qty: 1 }], ...actor }), 'not enough'),
      'with 0 left, one more unit cannot be sent');
    assert(t3.number === t2.number + 1, 'numbers keep counting up');

    // ---------------------------------------------------- stock check
    console.log('\n▶ Stock check');
    const ours = (r: Awaited<ReturnType<typeof reconcileStock>>) =>
      r.problems.filter((p) => p.branchName.startsWith(A.name));
    let check = await reconcileStock();
    assert(ours(check).length === 0, `after clean activity, the check finds nothing wrong for these branches (${ours(check).length})`);

    // Someone edits a count directly in the database, bypassing the ledger.
    await prisma.branchStock.update({ where: { branchId_productId: { branchId: A.id, productId: bar.id } }, data: { stock: { increment: 3 } } });
    check = await reconcileStock();
    const mismatch = ours(check).find((p) => p.kind === 'MISMATCH' && p.productName === bar.name);
    assert(!!mismatch && mismatch.onHand === 4 && mismatch.ledger === 1, `a hand-edited count is flagged (on hand 4, history says 1)`);
    await prisma.branchStock.update({ where: { branchId_productId: { branchId: A.id, productId: bar.id } }, data: { stock: { decrement: 3 } } });

    // A ledger row is altered after the fact.
    const victim = await prisma.stockMovement.findFirstOrThrow({ where: { branchId: A.id, productId: whey.id, type: 'TRANSFER_OUT' } });
    await prisma.stockMovement.update({ where: { id: victim.id }, data: { balanceAfter: victim.balanceAfter + 7 } });
    check = await reconcileStock();
    assert(ours(check).some((p) => p.kind === 'BROKEN_CHAIN' && p.productName === whey.name), 'a tampered history row is flagged as a gap');
    await prisma.stockMovement.update({ where: { id: victim.id }, data: { balanceAfter: victim.balanceAfter } });

    check = await reconcileStock();
    assert(ours(check).length === 0, 'once restored, the check is clean again');
  } finally {
    console.log('\n▶ Cleanup');
    await f.teardown();
  }

  const bad = failureCount();
  console.log(bad === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${bad} CHECK(S) FAILED\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
