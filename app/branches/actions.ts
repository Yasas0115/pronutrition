'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireOwner } from '@/lib/auth';

export type BranchInput = {
  id?: string;
  name: string;
  code?: string;
  phone?: string;
  address?: string;
  active: boolean;
};

export type BranchResult = { ok: true; id: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

function clean(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length ? t : null;
}

function revalidateAll() {
  revalidatePath('/', 'layout');
}

// Give a new branch a stock row (at 0) for every existing product.
async function seedBranchStock(branchId: string) {
  const products = await prisma.product.findMany({ select: { id: true } });
  if (products.length === 0) return;
  await prisma.branchStock.createMany({
    data: products.map((p) => ({ branchId, productId: p.id, stock: 0, lowStockAt: 5 })),
  });
}

export async function saveBranch(input: BranchInput): Promise<BranchResult> {
  await requireOwner();
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Branch name is required.' };

  // Reject a duplicate name (case-insensitive), ignoring the branch being
  // edited — two branches sharing a name are indistinguishable in the switcher
  // and split a branch's stock across phantom rows.
  const existing = await prisma.branch.findMany({ select: { id: true, name: true } });
  const clash = existing.find(
    (b) => b.id !== input.id && b.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) return { ok: false, error: `A branch named “${name}” already exists.` };

  const data = {
    name,
    code: clean(input.code),
    phone: clean(input.phone),
    address: clean(input.address),
    active: input.active,
  };

  try {
    if (input.id) {
      const b = await prisma.branch.update({ where: { id: input.id }, data });
      revalidateAll();
      return { ok: true, id: b.id };
    }
    const b = await prisma.branch.create({ data });
    await seedBranchStock(b.id);
    revalidateAll();
    return { ok: true, id: b.id };
  } catch {
    return { ok: false, error: 'Could not save the branch.' };
  }
}

// Permanently remove a branch. By default it must hold nothing of value — a
// branch with sales/stock/staff is refused so the owner is nudged to close it
// instead. With `force` (the owner deliberately confirming from the branch list)
// it is deleted regardless: its stock rows and movements cascade away, sales keep
// their branchName snapshot with branchId set null, and staff are unpinned.
export async function deleteBranch(id: string, force = false): Promise<SimpleResult> {
  await requireOwner();
  try {
    if (!force) {
      const [sales, units, users] = await Promise.all([
        prisma.sale.count({ where: { branchId: id } }),
        prisma.branchStock.aggregate({ where: { branchId: id }, _sum: { stock: true } }),
        prisma.user.count({ where: { branchId: id } }),
      ]);
      if (sales > 0) {
        return { ok: false, error: 'This branch has sales history — close it instead of deleting.' };
      }
      if ((units._sum.stock ?? 0) > 0) {
        return { ok: false, error: 'This branch still holds stock — move it out before deleting.' };
      }
      if (users > 0) {
        return { ok: false, error: 'Staff are still assigned to this branch — reassign them first.' };
      }
    }
    await prisma.branch.delete({ where: { id } }); // cascades BranchStock + movements; nulls Sale/User
    revalidateAll();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not delete the branch.' };
  }
}

export async function setBranchActive(id: string, active: boolean): Promise<SimpleResult> {
  await requireOwner();
  try {
    await prisma.branch.update({ where: { id }, data: { active } });
    revalidateAll();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not update the branch.' };
  }
}
