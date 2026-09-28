// All money is whole rupees (integers). These helpers format for display.

/** 14500 -> "14,500" */
export function fmt(n: number): string {
  return Math.round(n || 0).toLocaleString('en-LK');
}

/** 14500 -> "Rs 14,500" */
export function money(n: number, currency = 'Rs'): string {
  return `${currency} ${fmt(n)}`;
}

/** Parse a user-typed amount ("1,250" / "1250") into a safe integer. */
export function parseAmount(v: string | number): number {
  if (typeof v === 'number') return Math.max(0, Math.round(v));
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
