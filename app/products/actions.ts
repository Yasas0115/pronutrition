'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModule, canSeeCost, hasModule } from '@/lib/auth';
import { getActiveScope, ALL_BRANCHES } from '@/lib/branch';
import { setStockTo } from '@/lib/stock';
import { recordPriceChange } from '@/lib/price-history';
import { logAudit, diffFields } from '@/lib/audit';
import { revalidateAccounting } from '@/lib/revalidate';

export type ProductInput = {
  id?: string;
  name: string;
  category: string;
  brand?: string;
  flavor?: string;
  sku?: string;
  barcode?: string;
  price: number; // retail (selling) price
  // Buying price. Only honoured for the owner / `finance` module — anyone else's
  // value is ignored and the stored cost is left untouched.
  cost: number;
  active: boolean;
  // Gallery of data: URL photos. undefined = leave unchanged; [] clears them.
  // The first image becomes the product's cover (imageUrl).
  images?: string[];
  // Stock is per-branch; these apply to the current active branch.
  stock: number;
  lowStockAt: number;
};

// Guards so base64 photos can't bloat the SQLite row.
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 900_000; // per photo
const MAX_GALLERY_BYTES = 3_000_000; // all photos combined

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

function clean(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length ? t : null;
}

// Product edits change the catalogue (POS + Products) and category counts.
function revalidateCatalog() {
  revalidatePath('/products');
  revalidatePath('/categories');
  revalidateAccounting();
  revalidatePath('/');
}

// Make sure every branch has a stock row for this product (created at 0).
async function ensureStockRows(productId: string) {
  const branches = await prisma.branch.findMany({ select: { id: true } });
  for (const b of branches) {
    await prisma.branchStock.upsert({
      where: { branchId_productId: { branchId: b.id, productId } },
      update: {},
      create: { branchId: b.id, productId, stock: 0, lowStockAt: 5 },
    });
  }
}

export async function saveProduct(input: ProductInput): Promise<SaveResult> {
  // Editing the catalogue needs the products module (stock-only staff may not
  // change names, prices or photos).
  const session = await requireModule('products');
  const mayEditCost = await canSeeCost(session);
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Product name is required.' };
  if (input.price < 0) return { ok: false, error: 'Price must be zero or more.' };

  const existing = input.id
    ? await prisma.product.findUnique({
        where: { id: input.id },
        select: { name: true, category: true, brand: true, flavor: true, sku: true, barcode: true, price: true, cost: true, active: true },
      })
    : null;
  if (input.id && !existing) return { ok: false, error: 'Product not found.' };

  const data: Record<string, unknown> = {
    name,
    category: input.category.trim() || 'Supplements',
    brand: clean(input.brand),
    flavor: clean(input.flavor),
    sku: clean(input.sku),
    barcode: clean(input.barcode),
    price: Math.max(0, Math.round(input.price)),
    active: input.active,
  };
  // Buying price is accountant-level: never take it from a non-finance caller.
  if (mayEditCost) data.cost = Math.max(0, Math.round(input.cost));

  // Normalise the gallery: keep only non-empty data URLs, cap the count, and
  // mirror the first photo into imageUrl so grids that read the cover work.
  if (input.images !== undefined) {
    const photos = input.images.filter((s) => typeof s === 'string' && s.length > 0);
    if (photos.length > MAX_IMAGES) {
      return { ok: false, error: `Up to ${MAX_IMAGES} photos per product.` };
    }
    if (photos.some((p) => p.length > MAX_IMAGE_BYTES)) {
      return { ok: false, error: 'One of the photos is too large.' };
    }
    if (photos.reduce((sum, p) => sum + p.length, 0) > MAX_GALLERY_BYTES) {
      return { ok: false, error: 'Total photo size is too large — remove one.' };
    }
    data.images = JSON.stringify(photos);
    data.imageUrl = photos[0] ?? null;
  }

  try {
    // Product row + its price history + audit row commit together.
    const product = await prisma.$transaction(async (tx) => {
      const saved = input.id
        ? await tx.product.update({ where: { id: input.id }, data })
        : await tx.product.create({ data: data as never });

      const actor = { userId: session.userId, userName: session.name };

      if (existing) {
        await recordPriceChange(tx, {
          productId: saved.id,
          productName: saved.name,
          oldPrice: existing.price,
          newPrice: saved.price,
          oldCost: existing.cost,
          newCost: saved.cost,
          source: 'EDIT',
          ...actor,
        });

        const tracked = ['name', 'category', 'brand', 'flavor', 'sku', 'barcode', 'price', 'cost', 'active'] as const;
        const pick = (p: typeof existing) => Object.fromEntries(tracked.map((k) => [k, p[k]]));
        const { before, after, changed } = diffFields(pick(existing), pick(saved));
        if (changed.length > 0) {
          const priceMoved = changed.includes('price') || changed.includes('cost');
          await logAudit(tx, {
            entity: 'PRODUCT',
            entityId: saved.id,
            action: priceMoved ? 'PRICE_CHANGE' : 'UPDATE',
            summary: `Edited “${saved.name}” — changed ${changed.join(', ')}`,
            before,
            after,
            ...actor,
          });
        }
      } else {
        await recordPriceChange(tx, {
          productId: saved.id,
          productName: saved.name,
          oldPrice: 0,
          newPrice: saved.price,
          oldCost: 0,
          newCost: saved.cost,
          source: 'CREATE',
          ...actor,
        });
        await logAudit(tx, {
          entity: 'PRODUCT',
          entityId: saved.id,
          action: 'CREATE',
          summary: `Added product “${saved.name}”`,
          after: { price: saved.price, category: saved.category },
          ...actor,
        });
      }
      return saved;
    });

    await ensureStockRows(product.id);
    // Stock is per-branch and belongs to the `stock` grant, exactly like the
    // buying price belongs to `finance`. Apply the form's numbers only when the
    // caller holds it AND is looking at one real branch: on "All branches" the
    // form shows the company-wide total, which must never be written into a
    // single branch. The level goes through setStockTo so the change lands in
    // the movement ledger.
    const scope = await getActiveScope(session);
    if (scope !== ALL_BRANCHES && (await hasModule(session, 'stock'))) {
      await prisma.branchStock.update({
        where: { branchId_productId: { branchId: scope, productId: product.id } },
        data: { lowStockAt: Math.max(0, Math.round(input.lowStockAt || 0)) },
      });
      await setStockTo(prisma, {
        branchId: scope,
        productId: product.id,
        productName: product.name,
        target: input.stock || 0,
        note: input.id ? 'Edited from product form' : 'Set on product create',
        userId: session.userId,
        userName: session.name,
      });
    }

    revalidateCatalog();
    return { ok: true, id: product.id };
  } catch {
    return { ok: false, error: 'Could not save the product.' };
  }
}

// Stock quantities are changed through app/stock/actions.ts (receive, adjust,
// count, transfer) — the `stock` grant, an explicit branch, a ledger row each.

export async function deleteProduct(id: string): Promise<SimpleResult> {
  const session = await requireModule('products');
  try {
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true } });
    if (!product) return { ok: false, error: 'Product not found.' };
    // Keep sales history intact: if this product was ever sold, deactivate
    // instead of deleting (SaleItem.productId is set null on delete anyway).
    const sold = await prisma.saleItem.count({ where: { productId: id } });
    if (sold > 0) {
      await prisma.product.update({ where: { id }, data: { active: false } });
    } else {
      await prisma.product.delete({ where: { id } });
    }
    await logAudit(prisma, {
      entity: 'PRODUCT',
      entityId: id,
      action: 'DELETE',
      summary: sold > 0 ? `Deactivated “${product.name}” (has sales history)` : `Deleted product “${product.name}”`,
      userId: session.userId,
      userName: session.name,
    });
    revalidateCatalog();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not delete the product.' };
  }
}
