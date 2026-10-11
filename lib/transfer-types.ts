// Client-safe shapes and helpers for stock transfers. Kept apart from
// lib/transfers.ts, which talks to the database and must never be bundled into
// the browser.

export const transferLabel = (n: number | null) => (n == null ? '—' : `TRF-${n}`);

export type TransferLine = {
  productName: string;
  qty: number;
  fromBefore: number;
  fromAfter: number;
  toBefore: number;
  toAfter: number;
};

export type TransferRow = {
  id: string;
  number: number | null; // null for transfers made before documents existed
  createdAt: string;
  fromBranchName: string;
  toBranchName: string;
  note: string | null;
  userName: string | null;
  lines: TransferLine[];
};
