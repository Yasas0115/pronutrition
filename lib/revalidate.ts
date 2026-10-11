// Server actions that change money or stock call this so every Accounting page
// is re-read, whichever one the person opens next.
import { revalidatePath } from 'next/cache';

const ACCOUNTING_PATHS = [
  '/accounting/sales',
  '/accounting/receivables',
  '/accounting/expenses',
  '/accounting/profit',
  '/accounting/stock-value',
  '/accounting/activity',
];

export function revalidateAccounting(): void {
  for (const p of ACCOUNTING_PATHS) revalidatePath(p);
}
