'use client';

import { useMemo, useState } from 'react';
import { money, fmt } from '@/lib/money';
import { todayStr } from '@/lib/dates';
import type { PriceHistoryRow } from '@/lib/price-history';
import PriceHistoryTable from '../PriceHistoryTable';
import PrintHeader from './PrintHeader';

export type ValuationRow = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  active: boolean;
  units: number;
  cost: number; // buying price per unit
  price: number; // retail price per unit
};

type Tab = 'valuation' | 'prices';

export default function StockValueView({
  valuation,
  priceHistory,
  currency,
  storeName,
  scopeLabel,
}: {
  valuation: ValuationRow[];
  priceHistory: PriceHistoryRow[];
  currency: string;
  storeName: string;
  scopeLabel: string;
}) {
  const [tab, setTab] = useState<Tab>('valuation');

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5 no-print">
        <div>
          <h1 className="page-title">Stock value</h1>
          <p className="page-sub">
            Buying vs retail price, what the stock is worth and how prices changed, for{' '}
            <b style={{ color: 'var(--color-strong)' }}>{scopeLabel}</b> · switch branch from the top bar.
          </p>
        </div>
        {tab === 'valuation' && (
          <button className="btn btn-ghost" onClick={() => window.print()}>Print report</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        <button className="chip" data-active={tab === 'valuation' || undefined} onClick={() => setTab('valuation')}>Valuation</button>
        <button className="chip" data-active={tab === 'prices' || undefined} onClick={() => setTab('prices')}>Price history</button>
      </div>

      {tab === 'valuation' ? (
        <Valuation rows={valuation} currency={currency} storeName={storeName} scopeLabel={scopeLabel} />
      ) : (
        <PriceHistoryTable rows={priceHistory} currency={currency} />
      )}
    </>
  );
}

function Valuation({
  rows,
  currency,
  storeName,
  scopeLabel,
}: {
  rows: ValuationRow[];
  currency: string;
  storeName: string;
  scopeLabel: string;
}) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [onlyStocked, setOnlyStocked] = useState(true);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(rows.map((r) => r.category))).filter(Boolean).sort()],
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== 'All' && r.category !== cat) return false;
      if (onlyStocked && r.units <= 0) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.brand ?? '').toLowerCase().includes(q);
    });
  }, [rows, query, cat, onlyStocked]);

  const totals = useMemo(() => {
    let units = 0;
    let atCost = 0;
    let atRetail = 0;
    for (const r of shown) {
      units += r.units;
      atCost += r.units * r.cost;
      atRetail += r.units * r.price;
    }
    return { units, atCost, atRetail, margin: atRetail - atCost };
  }, [shown]);

  // Stocked items that have no buying price yet — their value at cost is
  // understated until the accountant sets it, so say so loudly.
  const missingCost = shown.filter((r) => r.units > 0 && r.cost <= 0).length;

  return (
    <>
      <PrintHeader storeName={storeName} line={`Stock valuation · ${scopeLabel} · ${todayStr()}`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Units in stock</div>
          <div className="stat__value">{fmt(totals.units)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Value at buying price</div>
          <div className="stat__value">{money(totals.atCost, currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Value at retail price</div>
          <div className="stat__value accent">{money(totals.atRetail, currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Potential margin</div>
          <div className="stat__value">{money(totals.margin, currency)}</div>
        </div>
      </div>

      {missingCost > 0 && (
        <div
          className="text-[13px] rounded-lg px-3 py-2.5 mb-4"
          style={{ color: 'var(--color-warn)', background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}
        >
          {missingCost} stocked product{missingCost === 1 ? ' has' : 's have'} no buying price yet, so the value at
          buying price and the margin are understated. Set it from Products → Edit or when receiving stock.
        </div>
      )}

      <div className="mb-4 no-print">
        <input className="input" placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto mt-3 pb-1">
          {categories.map((c) => (
            <button key={c} className="chip" data-active={cat === c || undefined} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none text-[13px]" style={{ color: 'var(--color-ash)' }}>
          <input
            type="checkbox"
            checked={onlyStocked}
            onChange={(e) => setOnlyStocked(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--color-brand)' }}
          />
          Only products currently in stock
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-center">Units</th>
                <th className="text-right">Buying price</th>
                <th className="text-right">Retail price</th>
                <th className="text-right">Value at buying</th>
                <th className="text-right">Value at retail</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={7} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No products to value.</td></tr>
              ) : (
                shown.map((r) => {
                  const noCost = r.cost <= 0;
                  return (
                    <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
                      <td>
                        <div className="text-strong font-semibold">{r.name}</div>
                        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                          {[r.category, r.brand].filter(Boolean).join(' · ')}{!r.active && ' · inactive'}
                        </div>
                      </td>
                      <td className="text-center num">{fmt(r.units)}</td>
                      <td className="text-right num whitespace-nowrap" style={{ color: noCost ? 'var(--color-warn)' : undefined }}>
                        {noCost ? 'not set' : money(r.cost, currency)}
                      </td>
                      <td className="text-right num whitespace-nowrap">{money(r.price, currency)}</td>
                      <td className="text-right num whitespace-nowrap">{money(r.units * r.cost, currency)}</td>
                      <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(r.units * r.price, currency)}</td>
                      <td className="text-right num whitespace-nowrap">{noCost ? '—' : money(r.units * (r.price - r.cost), currency)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td className="text-strong font-semibold">Total</td>
                  <td className="text-center num text-strong font-semibold">{fmt(totals.units)}</td>
                  <td></td>
                  <td></td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(totals.atCost, currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(totals.atRetail, currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(totals.margin, currency)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}
