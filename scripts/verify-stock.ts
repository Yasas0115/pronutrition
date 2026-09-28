// Integration check for the stock ledger against the real SQLite DB.
// Exercises the shared helpers every stock action funnels through
// (recordStockChange / setStockTo) plus the two-leg transfer invariant and the
// SALE movement written at checkout, asserting that the BranchStock count and
// the StockMovement ledger always agree. Rolls everything back so seed data is
// untouched.
import { prisma } from '../lib/db';
import { recordStockChange, setStockTo } from '../lib/stock';
import { performCheckout } from '../lib/checkout';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✔', msg);
  else { console.log('  x FAIL:', msg); failures++; }
}

const stockAt = async (branchId: string, productId: string) =>
  (await prisma.branchStock.findUnique({ where: { branchId_productId: { branchId, productId } } }))?.stock ?? 0;

const movesFor = async (productId: string) =>
  prisma.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: 'asc' } });

async function main() {
  const branches = await prisma.branch.findMany({ orderBy: { createdAt: 'asc' } });
  if (branches.length < 2) throw new Error('Need 2 branches — run pnpm db:seed first.');
  const [main, other] = branches;

  const product = await prisma.product.findFirst({ where: { name: { contains: 'Whey 2lb' } } });
  if (!product) throw new Error('Seed product missing — run pnpm db:seed first.');
  const pid = product.id;

  // Snapshot originals to restore later.
  const startMain = await stockAt(main.id, pid);
  const startOther = await stockAt(other.id, pid);
  const startMoveIds = new Set((await movesFor(pid)).map((m) => m.id));
  const startMoves = startMoveIds.size;

  // ---- 1. RESTOCK adds and logs ----
  console.log(`\n▶ Receive 30 into ${main.name}`);
  const afterRestock = await recordStockChange(prisma, {
    branchId: main.id, productId: pid, productName: product.name,
    delta: 30, type: 'RESTOCK', unitCost: 4200, note: 'test PO', userName: 'Verifier',
  });
  assert(afterRestock === startMain + 30, `on-hand ${startMain} → ${afterRestock}`);
  assert((await stockAt(main.id, pid)) === startMain + 30, 'restock persisted to BranchStock');
  const lastRestock = (await movesFor(pid)).at(-1)!;
  assert(lastRestock.type === 'RESTOCK' && lastRestock.delta === 30, 'RESTOCK movement logged (+30)');
  assert(lastRestock.balanceAfter === startMain + 30, 'movement balanceAfter matches on-hand');
  assert(lastRestock.unitCost === 4200, 'unit cost captured on movement');

  // ---- 2. ADJUST negative, and the below-zero guard ----
  console.log('\n▶ Adjust −5, then try to over-remove');
  const afterAdjust = await recordStockChange(prisma, {
    branchId: main.id, productId: pid, productName: product.name, delta: -5, type: 'ADJUST', note: 'damaged',
  });
  assert(afterAdjust === startMain + 25, `adjust −5 → ${afterAdjust}`);
  let guarded = false;
  try {
    await recordStockChange(prisma, { branchId: main.id, productId: pid, productName: product.name, delta: -(startMain + 25 + 1), type: 'ADJUST' });
  } catch { guarded = true; }
  assert(guarded, 'below-zero removal is rejected');
  assert((await stockAt(main.id, pid)) === startMain + 25, 'on-hand unchanged after rejected removal');

  // ---- 3. COUNT sets an absolute value ----
  console.log('\n▶ Stock-take to 77');
  const afterCount = await setStockTo(prisma, { branchId: main.id, productId: pid, productName: product.name, target: 77, note: 'count' });
  assert(afterCount === 77, `count set on-hand to ${afterCount}`);
  const lastCount = (await movesFor(pid)).at(-1)!;
  assert(lastCount.type === 'COUNT' && lastCount.balanceAfter === 77, 'COUNT movement logged with correct balance');
  assert(lastCount.delta === 77 - (startMain + 25), 'COUNT delta = target − previous');

  // ---- 4. TRANSFER: two legs, conserves total, guards over-transfer ----
  console.log(`\n▶ Transfer 10 from ${main.name} → ${other.name}`);
  const beforeFrom = await stockAt(main.id, pid);
  const beforeTo = await stockAt(other.id, pid);
  const transferId = 'test-transfer-1';
  await prisma.$transaction(async (tx) => {
    await recordStockChange(tx, { branchId: main.id, productId: pid, productName: product.name, delta: -10, type: 'TRANSFER_OUT', transferId });
    await recordStockChange(tx, { branchId: other.id, productId: pid, productName: product.name, delta: 10, type: 'TRANSFER_IN', transferId });
  });
  assert((await stockAt(main.id, pid)) === beforeFrom - 10, `source ${beforeFrom} → ${beforeFrom - 10}`);
  assert((await stockAt(other.id, pid)) === beforeTo + 10, `dest ${beforeTo} → ${beforeTo + 10}`);
  assert((await stockAt(main.id, pid)) + (await stockAt(other.id, pid)) === beforeFrom + beforeTo, 'total conserved across the transfer');
  const legs = await prisma.stockMovement.findMany({ where: { transferId } });
  assert(legs.length === 2, 'both transfer legs share one transferId');

  let overGuarded = false;
  try {
    await prisma.$transaction(async (tx) => {
      await recordStockChange(tx, { branchId: main.id, productId: pid, productName: product.name, delta: -999999, type: 'TRANSFER_OUT', transferId: 'x' });
      await recordStockChange(tx, { branchId: other.id, productId: pid, productName: product.name, delta: 999999, type: 'TRANSFER_IN', transferId: 'x' });
    });
  } catch { overGuarded = true; }
  assert(overGuarded, 'over-transfer rolls back (guard fires)');
  assert((await prisma.stockMovement.findMany({ where: { transferId: 'x' } })).length === 0, 'failed transfer wrote no movements (atomic)');

  // ---- 5. SALE at checkout writes a SALE movement ----
  console.log('\n▶ Checkout 2× writes SALE movement');
  const beforeSale = await stockAt(main.id, pid);
  const r = await performCheckout({
    items: [{ productId: pid, qty: 2 }], manualDiscount: 0, method: 'KOKO', paid: 999999,
    branchId: main.id, cashierId: null, cashierName: 'Verifier',
  });
  assert((await stockAt(main.id, pid)) === beforeSale - 2, `sale decremented ${beforeSale} → ${beforeSale - 2}`);
  const saleMove = (await movesFor(pid)).at(-1)!;
  assert(saleMove.type === 'SALE' && saleMove.delta === -2, 'SALE movement logged (−2)');
  assert(saleMove.balanceAfter === beforeSale - 2, 'SALE movement balance matches on-hand');
  assert(saleMove.saleId != null, 'SALE movement linked to its sale');

  // ---- Cleanup: delete the test sale + every movement we added, restore stock ----
  console.log('\n▶ Cleanup');
  await prisma.sale.delete({ where: { number: r.number } });
  const toDelete = (await movesFor(pid)).filter((m) => !startMoveIds.has(m.id)).map((m) => m.id);
  await prisma.stockMovement.deleteMany({ where: { id: { in: toDelete } } });
  await prisma.branchStock.update({ where: { branchId_productId: { branchId: main.id, productId: pid } }, data: { stock: startMain } });
  await prisma.branchStock.update({ where: { branchId_productId: { branchId: other.id, productId: pid } }, data: { stock: startOther } });
  const restoredMoves = (await movesFor(pid)).length;
  assert((await stockAt(main.id, pid)) === startMain, 'main stock restored');
  assert((await stockAt(other.id, pid)) === startOther, 'other stock restored');
  assert(restoredMoves === startMoves, `ledger restored (${restoredMoves} = ${startMoves})`);

  console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
