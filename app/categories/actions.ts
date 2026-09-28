'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export type SimpleResult = { ok: true } | { ok: false; error: string };
export type DeleteCategoryResult =
  | { ok: true; moved: number }
  | { ok: false; error: string };

const FALLBACK_CATEGORY = 'Uncategorized';

function revalidateCatalog() {
  revalidatePath('/categories');
  revalidatePath('/products');
  revalidatePath('/');
}

export async function addCategory(name: string): Promise<SimpleResult> {
  await requireSession();
  const n = (name ?? '').trim();
  if (!n) return { ok: false, error: 'Enter a category name.' };
  if (n.length > 40) return { ok: false, error: 'Category name is too long.' };

  // Case-insensitive duplicate check done in JS — SQLite's default BINARY
  // collation (and Prisma `equals`) is case-sensitive, so "protein" and
  // "Protein" would otherwise both be allowed.
  const all = await prisma.category.findMany({ select: { name: true } });
  const lower = n.toLowerCase();
  if (all.some((c) => c.name.toLowerCase() === lower)) {
    return { ok: false, error: `“${n}” already exists.` };
  }

  try {
    const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
    await prisma.category.create({
      data: { name: n, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    revalidateCatalog();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not add the category.' };
  }
}

export async function renameCategory(
  id: string,
  name: string,
): Promise<SimpleResult> {
  await requireSession();
  const n = (name ?? '').trim();
  if (!n) return { ok: false, error: 'Enter a category name.' };

  try {
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return { ok: false, error: 'Category not found.' };
    if (cat.name === n) return { ok: true };

    const lower = n.toLowerCase();
    const others = await prisma.category.findMany({
      where: { id: { not: id } },
      select: { name: true },
    });
    if (others.some((c) => c.name.toLowerCase() === lower)) {
      return { ok: false, error: `“${n}” already exists.` };
    }

    // Re-tag every product carrying the old name so nothing is orphaned.
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { category: cat.name },
        data: { category: n },
      }),
      prisma.category.update({ where: { id }, data: { name: n } }),
    ]);
    revalidateCatalog();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not rename the category.' };
  }
}

// Deleting a category that still has products moves them to "Uncategorized"
// (auto-created) so no product is left pointing at a name that no longer
// exists in the pick-list. Returns how many products were moved.
export async function deleteCategory(id: string): Promise<DeleteCategoryResult> {
  await requireSession();
  try {
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return { ok: false, error: 'Category not found.' };

    const inUse = await prisma.product.count({ where: { category: cat.name } });

    await prisma.$transaction(async (tx) => {
      if (inUse > 0 && cat.name !== FALLBACK_CATEGORY) {
        await tx.category.upsert({
          where: { name: FALLBACK_CATEGORY },
          update: {},
          create: { name: FALLBACK_CATEGORY, sortOrder: 9999 },
        });
        await tx.product.updateMany({
          where: { category: cat.name },
          data: { category: FALLBACK_CATEGORY },
        });
      }
      await tx.category.delete({ where: { id } });
    });

    revalidateCatalog();
    return { ok: true, moved: cat.name === FALLBACK_CATEGORY ? 0 : inUse };
  } catch {
    return { ok: false, error: 'Could not delete the category.' };
  }
}
