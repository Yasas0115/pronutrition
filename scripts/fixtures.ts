// Shared throw-away fixtures for the verify-* integration scripts: a temporary
// branch, products with stock, the default payment methods, and a customer
// factory. Nothing here assumes seed data, and teardown() puts every row it
// touched back exactly as it found it (invoice counter, tax %, payment-method
// rules included).
import type { PaymentMethod, Product, Branch, Store, Customer } from '@prisma/client';
import { prisma } from '../lib/db';
import { DEFAULT_PAYMENT_METHODS } from '../lib/payment-methods';
import { recordStockChange } from '../lib/stock';

export type Fixtures = {
  store: Store;
  branch: Branch;
  products: Product[];
  customers: Customer[];
  /** Create a registered customer (removed again by teardown). */
  makeCustomer: (name: string, type?: 'RETAIL' | 'SHOP') => Promise<Customer>;
  teardown: () => Promise<void>;
};

export async function setupFixtures(opts: {
  products: { name: string; price: number; cost: number; stock: number }[];
}): Promise<Fixtures> {
  // ---- store: must exist; tax forced to 0 so the arithmetic is predictable ----
  const storeBefore = await prisma.store.findFirst();
  const createdStore = !storeBefore;
  const store = storeBefore
    ? await prisma.store.update({ where: { id: storeBefore.id }, data: { taxPercent: 0 } })
    : await prisma.store.create({ data: { name: 'Verify Store', taxPercent: 0 } });
  const startInvoice = storeBefore?.nextInvoice ?? store.nextInvoice;
  const startTax = storeBefore?.taxPercent ?? 0;

  // ---- payment methods: force the documented defaults, remember the originals ----
  const originals = new Map<string, PaymentMethod | null>();
  for (const m of DEFAULT_PAYMENT_METHODS) {
    const existing = await prisma.paymentMethod.findUnique({ where: { key: m.key } });
    originals.set(m.key, existing);
    await prisma.paymentMethod.upsert({
      where: { key: m.key },
      update: { ...m, active: true },
      create: { ...m, active: true },
    });
  }

  // ---- branch + products + stock ----
  const branch = await prisma.branch.create({ data: { name: `VERIFY-${Date.now()}` } });
  const products: Product[] = [];
  for (const p of opts.products) {
    const row = await prisma.product.create({
      data: { name: p.name, category: 'Verify', price: p.price, cost: p.cost },
    });
    await recordStockChange(prisma, {
      branchId: branch.id,
      productId: row.id,
      productName: row.name,
      delta: p.stock,
      type: 'INITIAL',
      userName: 'Verifier',
    });
    products.push(row);
  }

  const customers: Customer[] = [];
  const makeCustomer = async (name: string, type: 'RETAIL' | 'SHOP' = 'RETAIL') => {
    const c = await prisma.customer.create({ data: { name: `VERIFY ${name}`, type } });
    customers.push(c);
    return c;
  };

  const teardown = async () => {
    const productIds = products.map((p) => p.id);
    await prisma.sale.deleteMany({ where: { branchId: branch.id } }); // cascades items + payments
    await prisma.stockMovement.deleteMany({ where: { branchId: branch.id } });
    await prisma.productPriceHistory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.auditLog.deleteMany({ where: { entity: 'CUSTOMER', entityId: { in: customers.map((c) => c.id) } } });
    // Money-out rows are all tagged with the fixture branch. Expenses first: a
    // salary expense points at its SalaryPayment.
    await prisma.expense.deleteMany({ where: { branchId: branch.id } });
    await prisma.salaryPayment.deleteMany({ where: { branchId: branch.id } });
    await prisma.worker.deleteMany({ where: { branchId: branch.id } });
    await prisma.auditLog.deleteMany({ where: { branchId: branch.id } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: 'VERIFY' } } });
    await prisma.branchStock.deleteMany({ where: { branchId: branch.id } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } });
    await prisma.branch.delete({ where: { id: branch.id } });

    for (const [key, orig] of originals) {
      if (!orig) await prisma.paymentMethod.delete({ where: { key } });
      else {
        await prisma.paymentMethod.update({
          where: { key },
          data: {
            label: orig.label,
            discountPercent: orig.discountPercent,
            requiresCustomer: orig.requiresCustomer,
            allowsPartial: orig.allowsPartial,
            active: orig.active,
          },
        });
      }
    }
    if (createdStore) await prisma.store.delete({ where: { id: store.id } });
    else await prisma.store.update({ where: { id: store.id }, data: { nextInvoice: startInvoice, taxPercent: startTax } });
  };

  return { store, branch, products, customers, makeCustomer, teardown };
}

let failures = 0;
export function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✔', msg);
  else {
    console.log('  x FAIL:', msg);
    failures++;
  }
}
export const failureCount = () => failures;

/** Resolve true if `fn` rejects (optionally with a message containing `text`). */
export async function rejects(fn: () => Promise<unknown>, text?: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return text ? String((e as Error).message).toLowerCase().includes(text.toLowerCase()) : true;
  }
}

export const stockAt = async (branchId: string, productId: string) =>
  (await prisma.branchStock.findUnique({ where: { branchId_productId: { branchId, productId } } }))?.stock ?? 0;
