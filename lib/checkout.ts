// Core checkout logic, extracted so it can be exercised directly in tests as
// well as from the server action. Runs the whole sale as one transaction:
// validate the branch's stock, snapshot prices, apply the payment-method
// discount (+ any manual discount), compute totals, enforce the customer rules,
// assign the next invoice number, create the sale + items + payment rows, and
// decrement that branch's stock.
//
// Rules enforced HERE (the server), never trusted from the browser:
//   • Walk-ins may only pay with methods that don't need a registered customer
//     (Cash, Card). Koko, Bank transfer and Credit require one.
//   • A wholesale sale always needs a registered customer, skips the
//     payment-method % discount, and may carry a per-line price override.
//   • Credit takes a "paid now" amount; the rest stays on the sale as
//     `balanceDue` and on the customer's account.
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { recordStockChange } from './stock';
import { SETTLEMENT_METHODS } from './payment-methods';

export type SaleType = 'RETAIL' | 'WHOLESALE';

// `price` is only honoured on a wholesale sale (cashier edits the line price).
export type CartLine = { productId: string; qty: number; price?: number };

export type CheckoutCore = {
  items: CartLine[];
  // Extra discount typed by the cashier, on top of the payment-method %.
  manualDiscount: number;
  method: string; // CASH | CARD | KOKO | BANK | CREDIT
  // CASH: money handed over. CREDIT: the "paid now" part. Others: ignored.
  paid: number;
  // How the "paid now" part of a CREDIT sale was taken (CASH | CARD | BANK).
  paidVia?: string;
  // Free-text name for a walk-in. Ignored when a registered customer is chosen.
  customerName?: string;
  customerId?: string | null;
  saleType?: SaleType;
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
  balanceDue: number;
  saleType: SaleType;
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
  const saleType: SaleType = input.saleType === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
  const wholesale = saleType === 'WHOLESALE';

  return prisma.$transaction(async (tx) => {
    const store = await tx.store.findFirst();
    const taxPercent = store?.taxPercent ?? 0;

    const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
    if (!branch) throw new Error('The selected branch no longer exists.');

    // The payment method must exist and be switched on — an unknown key used to
    // sail through with a 0% discount.
    const pm = await tx.paymentMethod.findUnique({ where: { key: input.method } });
    if (!pm || !pm.active) throw new Error('That payment method is not available.');

    // ---- Customer rules ----
    const customer = input.customerId
      ? await tx.customer.findUnique({ where: { id: input.customerId } })
      : null;
    if (input.customerId && (!customer || !customer.active)) {
      throw new Error('That customer is no longer registered. Pick another or sell to a walk-in.');
    }
    if (!customer) {
      if (wholesale) throw new Error('Wholesale sales need a registered customer.');
      if (pm.requiresCustomer) {
        throw new Error(`${pm.label} payments need a registered customer. Walk-ins can pay by cash or card.`);
      }
    }

    // Percentage discount for the chosen payment method (e.g. cash 10%). Wholesale
    // is priced by hand, so the auto method discount does not apply.
    const methodPercent = wholesale ? 0 : Math.max(0, Math.min(100, pm.discountPercent));

    const ids = items.map((i) => i.productId);
    const products = await tx.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const stockRows = await tx.branchStock.findMany({
      where: { branchId: input.branchId, productId: { in: ids } },
    });
    const stockByProduct = new Map(stockRows.map((s) => [s.productId, s]));

    let subtotal = 0;
    const lines: (ReceiptItem & { productId: string; unitCost: number; listPrice: number })[] = [];
    for (const it of items) {
      const p = byId.get(it.productId);
      if (!p) throw new Error('A product in the cart no longer exists.');
      const onHand = stockByProduct.get(p.id)?.stock ?? 0;
      if (onHand < it.qty) throw new Error(`Not enough stock for ${p.name} (only ${onHand} left at ${branch.name}).`);

      // Retail always sells at the shelf price; a wholesale cashier may edit it.
      let unit = p.price;
      if (wholesale && it.price != null) {
        const o = Math.round(Number(it.price));
        if (!Number.isFinite(o) || o < 0) throw new Error(`Enter a valid price for ${p.name}.`);
        unit = o;
      }
      const lineTotal = unit * it.qty;
      subtotal += lineTotal;
      // `unitCost` is the buying price at this moment — frozen on the line so
      // later cost changes never rewrite the profit on a past sale.
      lines.push({
        productId: p.id, name: p.name, price: unit, qty: it.qty, lineTotal,
        unitCost: p.cost, listPrice: p.price,
      });
    }

    const methodDiscount = Math.min(subtotal, Math.round((subtotal * methodPercent) / 100));
    const manualDiscount = Math.max(0, Math.min(Math.round(input.manualDiscount || 0), subtotal - methodDiscount));
    const discount = methodDiscount + manualDiscount;
    const taxed = subtotal - discount;
    const tax = Math.round((taxed * taxPercent) / 100);
    const total = taxed + tax;

    // ---- Payment ----
    const tendered = Math.max(0, Math.round(input.paid || 0));
    let paid: number;
    let change = 0;
    let balanceDue = 0;
    const payments: { amount: number; method: string }[] = [];

    if (pm.allowsPartial) {
      // Credit: "paid now" may be 0..total; the remainder stays owing.
      if (tendered > total) throw new Error('The paid-now amount cannot be more than the total.');
      paid = tendered;
      balanceDue = total - tendered;
      if (tendered > 0) {
        const viaKey = input.paidVia || 'CASH';
        if (!(SETTLEMENT_METHODS as readonly string[]).includes(viaKey)) {
          throw new Error('Choose cash, card or bank transfer for the paid-now amount.');
        }
        const via = await tx.paymentMethod.findUnique({ where: { key: viaKey } });
        if (!via || !via.active) throw new Error('That way of paying is not available.');
        payments.push({ amount: tendered, method: viaKey });
      }
    } else if (input.method === 'CASH') {
      if (tendered < total) throw new Error('Cash received is less than the total.');
      paid = tendered;
      change = tendered - total;
      if (total > 0) payments.push({ amount: total, method: 'CASH' });
    } else {
      paid = total;
      if (total > 0) payments.push({ amount: total, method: input.method });
    }

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

    // Registered customers always show under their own name on the receipt.
    const customerName = customer?.name ?? (input.customerName?.trim() || null);

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
        paid,
        change,
        balanceDue,
        saleType,
        method: input.method,
        customerId: customer?.id ?? null,
        customerName,
        cashierId: input.cashierId,
        cashierName: input.cashierName,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            price: l.price,
            qty: l.qty,
            lineTotal: l.lineTotal,
            listPrice: l.listPrice,
            unitCost: l.unitCost,
          })),
        },
        payments: {
          create: payments.map((p) => ({
            customerId: customer?.id ?? null,
            branchId: branch.id,
            amount: p.amount,
            method: p.method,
            kind: 'SALE',
            userId: input.cashierId,
            userName: input.cashierName,
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
      balanceDue,
      saleType,
      method: sale.method,
      customerName: sale.customerName,
      cashierName: sale.cashierName,
      items: lines.map(({ name, price, qty, lineTotal }) => ({ name, price, qty, lineTotal })),
    } satisfies Receipt;
  });
}
