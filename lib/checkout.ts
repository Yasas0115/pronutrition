// Core checkout logic, extracted so it can be exercised directly in tests as
// well as from the server action. Runs the whole sale as one transaction:
// validate the branch's stock, snapshot prices, apply the payment-method
// discount (+ any manual discount), compute totals, assign the next invoice
// number, create the sale + items, and decrement that branch's stock.
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { recordStockChange } from './stock';

export type CartLine = { productId: string; qty: number };

export type CheckoutCore = {
  items: CartLine[];
  // Extra discount typed by the cashier, on top of the payment-method %.
  manualDiscount: number;
  method: string; // CASH | CARD | KOKO | …
  paid: number;
  customerName?: string;
  branchId: string;
  cashierId: string | null;
  cashierName: string | null;
};

export type ReceiptItem = { name: string; price: number; qty: number; lineTotal: number };

export type Receipt = {
  number: number;
  createdAt: string;
  branchName: string | null;
  subtotal: number;
  discount: number;
  methodDiscount: number;
  manualDiscount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  method: string;
  customerName: string | null;
  cashierName: string | null;
  items: ReceiptItem[];
};

export async function performCheckout(input: CheckoutCore): Promise<Receipt> {
  const items = (input.items ?? []).filter((i) => i.qty > 0);
  if (items.length === 0) throw new Error('Cart is empty.');
  if (!input.branchId) throw new Error('No branch selected for this sale.');

  // Safety net: if an invoice number still collides (unique index), retry.
  for (let attempt = 0; ; attempt++) {
    try {
      return await checkoutOnce(input, items);
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (!clash || attempt >= 4) throw e;
    }
  }
}

function checkoutOnce(input: CheckoutCore, items: CartLine[]): Promise<Receipt> {
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.findFirst();
    const taxPercent = store?.taxPercent ?? 0;

    const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
    if (!branch) throw new Error('The selected branch no longer exists.');

    // Percentage discount for the chosen payment method (e.g. cash 10%).
    const pm = await tx.paymentMethod.findUnique({ where: { key: input.method } });
    const methodPercent = Math.max(0, Math.min(100, pm?.discountPercent ?? 0));

    const ids = items.map((i) => i.productId);
    const products = await tx.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const stockRows = await tx.branchStock.findMany({
      where: { branchId: input.branchId, productId: { in: ids } },
    });
    const stockByProduct = new Map(stockRows.map((s) => [s.productId, s]));

    let subtotal = 0;
    const lines: (ReceiptItem & { productId: string })[] = [];
    for (const it of items) {
      const p = byId.get(it.productId);
      if (!p) throw new Error('A product in the cart no longer exists.');
      const onHand = stockByProduct.get(p.id)?.stock ?? 0;
      if (onHand < it.qty) throw new Error(`Not enough stock for ${p.name} (only ${onHand} left at ${branch.name}).`);
      const lineTotal = p.price * it.qty;
      subtotal += lineTotal;
      lines.push({ productId: p.id, name: p.name, price: p.price, qty: it.qty, lineTotal });
    }

    const methodDiscount = Math.min(subtotal, Math.round((subtotal * methodPercent) / 100));
    const manualDiscount = Math.max(0, Math.min(Math.round(input.manualDiscount || 0), subtotal - methodDiscount));
    const discount = methodDiscount + manualDiscount;
    const taxed = subtotal - discount;
    const tax = Math.round((taxed * taxPercent) / 100);
    const total = taxed + tax;
    const paid = Math.max(0, Math.round(input.paid || 0));
    if (input.method === 'CASH' && paid < total) {
      throw new Error('Cash received is less than the total.');
    }
    const change = input.method === 'CASH' ? Math.max(0, paid - total) : 0;

    // Claim the next invoice number. The increment row-locks the Store until
    // this transaction ends, so concurrent checkouts queue up here instead of
    // reading the same max(number). Never go below an existing sale number.
    if (!store) throw new Error('Company is not set up yet.');
    const claimed = await tx.store.update({
      where: { id: store.id },
      data: { nextInvoice: { increment: 1 } },
      select: { nextInvoice: true },
    });
    const last = await tx.sale.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const number = Math.max(claimed.nextInvoice - 1, (last?.number ?? 1000) + 1);

    const sale = await tx.sale.create({
      data: {
        number,
        branchId: branch.id,
        branchName: branch.name,
        subtotal,
        discount,
        methodDiscount,
        manualDiscount,
        tax,
        total,
        paid: input.method === 'CASH' ? paid : total,
        change,
        method: input.method,
        customerName: input.customerName?.trim() || null,
        cashierId: input.cashierId,
        cashierName: input.cashierName,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            price: l.price,
            qty: l.qty,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });

    for (const l of lines) {
      await recordStockChange(tx, {
        branchId: branch.id,
        productId: l.productId,
        productName: l.name,
        delta: -l.qty,
        type: 'SALE',
        saleId: sale.id,
        note: `Invoice #${sale.number}`,
        userId: input.cashierId,
        userName: input.cashierName,
      });
    }

    return {
      number: sale.number,
      createdAt: sale.createdAt.toISOString(),
      branchName: branch.name,
      subtotal,
      discount,
      methodDiscount,
      manualDiscount,
      tax,
      total,
      paid: sale.paid,
      change,
      method: sale.method,
      customerName: sale.customerName,
      cashierName: sale.cashierName,
      items: lines.map(({ name, price, qty, lineTotal }) => ({ name, price, qty, lineTotal })),
    } satisfies Receipt;
  });
}
