'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModule, requireAnyModule, canSeeCost } from '@/lib/auth';
import { getTillBranchId } from '@/lib/branch';
import { recordStockChange, setStockTo } from '@/lib/stock';
import { recordPriceChange } from '@/lib/price-history';
import { logAudit, diffFields } from '@/lib/audit';

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
  revalidatePath('/accounts');
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
  const branchId = await getTillBranchId(session);
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
    // Apply the stock/low-stock values to the current branch. The stock level
    // goes through setStockTo so any change is captured in the movement ledger.
    if (branchId) {
      await prisma.branchStock.update({
        where: { branchId_productId: { branchId, productId: product.id } },
        data: { lowStockAt: Math.max(0, Math.round(input.lowStockAt || 0)) },
      });
      await setStockTo(prisma, {
        branchId,
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

export async function adjustStock(id: string, delta: number): Promise<SimpleResult> {
  const session = await requireAnyModule(['stock', 'products']);
  const branchId = await getTillBranchId(session);
  if (!branchId) return { ok: false, error: 'No active branch.' };
  try {
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true } });
    if (!product) return { ok: false, error: 'Product not found.' };
    await recordStockChange(prisma, {
      branchId,
      productId: id,
      productName: product.name,
      delta: Math.round(delta),
      type: 'ADJUST',
      userId: session.userId,
      userName: session.name,
    });
    revalidateCatalog();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not adjust stock.' };
  }
}

export async function setStock(id: string, value: number): Promise<SimpleResult> {
  const session = await requireAnyModule(['stock', 'products']);
  const branchId = await getTillBranchId(session);
  if (!branchId) return { ok: false, error: 'No active branch.' };
  try {
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true } });
    if (!product) return { ok: false, error: 'Product not found.' };
    await setStockTo(prisma, {
      branchId,
      productId: id,
      productName: product.name,
      target: Number(value) || 0,
      note: 'Inline stock edit',
      userId: session.userId,
      userName: session.name,
    });
    revalidateCatalog();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update stock.' };
  }
}

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
