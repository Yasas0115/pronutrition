'use client';

import { useMemo, useState } from 'react';
import { money, fmt } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { PRICE_SOURCE_LABELS, type PriceChangeSource, type PriceHistoryRow } from '@/lib/price-history';

// "Rs 4,500 → Rs 4,800" with the move coloured: a rise is the accent colour, a
// fall is the warning colour, no change is muted.
function Move({ from, to, currency }: { from: number; to: number; currency: string }) {
  if (from === to) {
    return <span style={{ color: 'var(--color-faint)' }}>{money(to, currency)} (no change)</span>;
  }
  const up = to > from;
  return (
    <span className="whitespace-nowrap">
      <span style={{ color: 'var(--color-muted)' }}>{money(from, currency)}</span>
      {' → '}
      <b style={{ color: up ? 'var(--color-ok)' : 'var(--color-warn)' }}>{money(to, currency)}</b>
    </span>
  );
}

function Effect({ delta, currency }: { delta: number; currency: string }) {
  if (delta === 0) return <span style={{ color: 'var(--color-faint)' }}>—</span>;
  return (
    <b style={{ color: delta > 0 ? 'var(--color-ok)' : 'var(--color-warn)' }}>
      {delta > 0 ? '+' : '−'} {money(Math.abs(delta), currency)}
    </b>
  );
}

export default function PriceHistoryTable({
  rows,
  currency,
}: {
  rows: PriceHistoryRow[];
  currency: string;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.productName.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <>
      <div className="mb-4">
        <input
          className="input"
          placeholder="Search a product…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Retail price</th>
                <th>Buying price</th>
                <th className="text-center">Units on hand</th>
                <th className="text-right">Effect on stock value</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>
                    No price changes recorded yet.
                  </td>
                </tr>
              ) : (
                shown.map((r) => {
                  const created = r.source === 'CREATE';
                  const retailEffect = created ? 0 : (r.newPrice - r.oldPrice) * r.onHandUnits;
                  const costEffect = created ? 0 : (r.newCost - r.oldCost) * r.onHandUnits;
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap" style={{ color: 'var(--color-muted)', fontSize: 12 }}>
                        {fmtDateTime(r.createdAt)}
                      </td>
                      <td>
                        <div className="text-strong font-semibold">{r.productName}</div>
                        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                          {PRICE_SOURCE_LABELS[r.source as PriceChangeSource] ?? r.source}
                          {r.note ? ` · ${r.note}` : ''}
                        </div>
                      </td>
                      <td className="text-[13px]">
                        {created ? <b>{money(r.newPrice, currency)}</b> : <Move from={r.oldPrice} to={r.newPrice} currency={currency} />}
                      </td>
                      <td className="text-[13px]">
                        {created ? <b>{money(r.newCost, currency)}</b> : <Move from={r.oldCost} to={r.newCost} currency={currency} />}
                      </td>
                      <td className="text-center num">{fmt(r.onHandUnits)}</td>
                      <td className="text-right text-[13px]">
                        <div>
                          <span style={{ color: 'var(--color-muted)' }}>Retail </span>
                          <Effect delta={retailEffect} currency={currency} />
                        </div>
                        <div>
                          <span style={{ color: 'var(--color-muted)' }}>At cost </span>
                          <Effect delta={costEffect} currency={currency} />
                        </div>
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: 12 }}>{r.userName || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
