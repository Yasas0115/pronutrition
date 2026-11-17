// Voiding a sale (wrong price, wrong item, keyed by mistake). The sale row is
// kept for the record, but:
//   - its units go back on the shelf (a SALE_VOID stock movement + a new batch at
//     the cost the units were sold at),
//   - its payment rows are removed so cash drawer / takings / profit no longer
//     count the money (the amounts are kept in the audit log),
//   - its unpaid credit balance is cleared so it leaves the customer's account,
//   - every sales report skips it (`voidedAt: null`).
// A sale that already has a later credit settlement against it can't be voided:
// that money was collected for real and has to be sorted out by hand first.
import { prisma } from './db';
import { logAudit } from './audit';
import { applyStockChange } from './stock';
import { fmt } from './money';

export async function voidSale(input: {
  saleId: string;
  reason: string;
  userId: string | null;
  userName: string | null;
}): Promise<{ number: number }> {
  const reason = (input.reason ?? '').trim();
  if (reason.length < 3) throw new Error('Enter a reason for voiding this sale.');

  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: input.saleId },
      include: { items: true, payments: true },
    });
    if (!sale) throw new Error('Sale not found.');
    if (sale.voidedAt) throw new Error(`Invoice #${sale.number} is already voided.`);
    if (sale.payments.some((p) => p.kind === 'SETTLEMENT')) {
      throw new Error(
        `Invoice #${sale.number} has credit payments collected against it, so it can't be voided here.`,
      );
    }

    // Claim the void first (only one caller can flip voidedAt from null).
    const claimed = await tx.sale.updateMany({
      where: { id: sale.id, voidedAt: null },
      data: {
        voidedAt: new Date(),
        voidedByName: input.userName,
        voidReason: reason,
        balanceDue: 0,
      },
    });
    if (claimed.count === 0) throw new Error(`Invoice #${sale.number} is already voided.`);

    // Put the units back (only for products that still exist and a branch we know).
    if (sale.branchId) {
      for (const it of sale.items) {
        if (!it.productId || it.qty <= 0) continue;
        const cost =
          it.unitCost ??
          (await tx.product.findUnique({ where: { id: it.productId }, select: { cost: true } }))?.cost ??
          0;
        await applyStockChange(tx, {
          branchId: sale.branchId,
          productId: it.productId,
          productName: it.name,
          delta: it.qty,
          type: 'SALE_VOID',
          costParts: [{ qty: it.qty, unitCost: cost }],
          saleId: sale.id,
          note: `Invoice #${sale.number} voided — ${reason}`,
          userId: input.userId,
          userName: input.userName,
        });
      }
    }

    await tx.salePayment.deleteMany({ where: { saleId: sale.id } });

    await logAudit(tx, {
      entity: 'SALE',
      entityId: sale.id,
      action: 'VOID',
      summary: `Voided invoice #${sale.number} (Rs ${fmt(sale.total)}) — ${reason}`,
      before: {
        invoice: sale.number,
        total: sale.total,
        paid: sale.paid,
        balanceDue: sale.balanceDue,
        method: sale.method,
        payments: sale.payments.map((p) => ({ amount: p.amount, method: p.method })),
        items: sale.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      },
      branchId: sale.branchId,
      userId: input.userId,
      userName: input.userName,
    });

    return { number: sale.number };
  });
}
