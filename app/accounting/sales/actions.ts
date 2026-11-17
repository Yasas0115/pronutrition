'use server';

import { revalidatePath } from 'next/cache';
import { requireModule } from '@/lib/auth';
import { revalidateAccounting } from '@/lib/revalidate';
import { voidSale } from '@/lib/void-sale';

export type VoidSaleResult = { ok: true } | { ok: false; error: string };

// Owner only: voiding a bill changes takings, profit and stock.
export async function voidSaleAction(saleId: string, reason: string): Promise<VoidSaleResult> {
  const session = await requireModule('reports');
  if (session.role !== 'OWNER') return { ok: false, error: 'Only the owner can void a sale.' };
  try {
    await voidSale({ saleId, reason, userId: session.userId, userName: session.name });
    revalidateAccounting();
    revalidatePath('/customers');
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not void the sale.' };
  }
}
