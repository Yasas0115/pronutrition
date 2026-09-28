'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { getTillBranchId } from '@/lib/branch';
import { recordStockChange, setStockTo } from '@/lib/stock';

export type ProductInput = {
  id?: string;
  name: string;
  category: string;
  brand?: string;
  flavor?: string;
  sku?: string;
  barcode?: string;
  price: number;
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
  const session = await requireSession();
  const branchId = await getTillBranchId(session);
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Product name is required.' };
  if (input.price < 0) return { ok: false, error: 'Price must be zero or more.' };

  const data: Record<string, unknown> = {
    name,
    category: input.category.trim() || 'Supplements',
    brand: clean(input.brand),
    flavor: clean(input.flavor),
    sku: clean(input.sku),
    barcode: clean(input.barcode),
    price: Math.max(0, Math.round(input.price)),
    cost: Math.max(0, Math.round(input.cost)),
    active: input.active,
  };

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
    const product = input.id
      ? await prisma.product.update({ where: { id: input.id }, data })
      : await prisma.product.create({ data: data as never });

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
  const session = await requireSession();
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
  const session = await requireSession();
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
  await requireSession();
  try {
    // Keep sales history intact: if this product was ever sold, deactivate
    // instead of deleting (SaleItem.productId is set null on delete anyway).
    const sold = await prisma.saleItem.count({ where: { productId: id } });
    if (sold > 0) {
      await prisma.product.update({ where: { id }, data: { active: false } });
    } else {
      await prisma.product.delete({ where: { id } });
    }
    revalidateCatalog();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not delete the product.' };
  }
}
