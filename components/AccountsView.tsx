'use client';

import { useMemo, useState } from 'react';
import { money, fmt } from '@/lib/money';
import { fmtDateTime, todayStr } from '@/lib/dates';
import PriceHistoryTable, { type PriceHistoryRow } from './PriceHistoryTable';

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

export type AuditRow = {
  id: string;
  entity: string;
  action: string;
  summary: string;
  userName: string | null;
  createdAt: string;
  changes: { field: string; from: string; to: string }[];
};

// One customer's unpaid credit, split by how old the unpaid sales are.
export type CreditRow = {
  key: string;
  name: string;
  due: number;
  count: number; // unpaid sales
  oldestAt: string;
  b0: number; // 0–30 days
  b30: number; // 31–60
  b60: number; // 61–90
  b90: number; // 90+
};

// Sales rolled up by payment method + sale type for one period.
export type MixRow = {
  period: 'today' | 'month' | 'all';
  method: string;
  saleType: string; // RETAIL | WHOLESALE
  count: number;
  total: number;
  due: number;
};

type Tab = 'valuation' | 'credit' | 'mix' | 'prices' | 'activity';

export default function AccountsView({
  valuation,
  priceHistory,
  credit,
  mix,
  audit,
  currency,
  storeName,
  scopeLabel,
}: {
  valuation: ValuationRow[];
  priceHistory: PriceHistoryRow[];
  credit: CreditRow[];
  mix: MixRow[];
  audit: AuditRow[];
  currency: string;
  storeName: string;
  scopeLabel: string;
}) {
  const [tab, setTab] = useState<Tab>('valuation');

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5 no-print">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-sub">
            Buying prices, stock value and change history for{' '}
            <b style={{ color: 'var(--color-strong)' }}>{scopeLabel}</b> · switch branch from the top bar.
          </p>
        </div>
        {tab === 'valuation' && (
          <button className="btn btn-ghost" onClick={() => window.print()}>Print report</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        <button className="chip" data-active={tab === 'valuation' || undefined} onClick={() => setTab('valuation')}>Stock valuation</button>
        <button className="chip" data-active={tab === 'credit' || undefined} onClick={() => setTab('credit')}>
          Credit outstanding{credit.length > 0 && ` (${credit.length})`}
        </button>
        <button className="chip" data-active={tab === 'mix' || undefined} onClick={() => setTab('mix')}>Sales mix</button>
        <button className="chip" data-active={tab === 'prices' || undefined} onClick={() => setTab('prices')}>Price history</button>
        <button className="chip" data-active={tab === 'activity' || undefined} onClick={() => setTab('activity')}>Activity log</button>
      </div>

      {tab === 'valuation' && (
        <Valuation rows={valuation} currency={currency} storeName={storeName} scopeLabel={scopeLabel} />
      )}
      {tab === 'credit' && <CreditTable rows={credit} currency={currency} />}
      {tab === 'mix' && <SalesMix rows={mix} currency={currency} />}
      {tab === 'prices' && <PriceHistoryTable rows={priceHistory} currency={currency} />}
      {tab === 'activity' && <ActivityLog rows={audit} />}
    </>
  );
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', CARD: 'Card', KOKO: 'Koko', BANK: 'Bank transfer', CREDIT: 'Credit',
};

function CreditTable({ rows, currency }: { rows: CreditRow[]; currency: string }) {
  const sum = (f: (r: CreditRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Total outstanding</div>
          <div className="stat__value" style={{ color: rows.length ? 'var(--color-warn)' : undefined }}>{money(sum((r) => r.due), currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Customers owing</div>
          <div className="stat__value">{rows.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Over 30 days</div>
          <div className="stat__value">{money(sum((r) => r.b30 + r.b60 + r.b90), currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Over 90 days</div>
          <div className="stat__value" style={{ color: sum((r) => r.b90) ? 'var(--color-brand)' : undefined }}>{money(sum((r) => r.b90), currency)}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="text-center">Unpaid sales</th>
                <th className="text-right">0–30 days</th>
                <th className="text-right">31–60</th>
                <th className="text-right">61–90</th>
                <th className="text-right">90+</th>
                <th className="text-right">Total owed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>Nobody owes anything right now.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <div className="text-strong font-semibold">{r.name}</div>
                      <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                        oldest {days(r.oldestAt)} day{days(r.oldestAt) === 1 ? '' : 's'} · since {fmtDateTime(r.oldestAt)}
                      </div>
                    </td>
                    <td className="text-center num">{r.count}</td>
                    <td className="text-right num whitespace-nowrap">{r.b0 ? money(r.b0, currency) : '—'}</td>
                    <td className="text-right num whitespace-nowrap">{r.b30 ? money(r.b30, currency) : '—'}</td>
                    <td className="text-right num whitespace-nowrap">{r.b60 ? money(r.b60, currency) : '—'}</td>
                    <td className="text-right num whitespace-nowrap" style={{ color: r.b90 ? 'var(--color-brand)' : undefined }}>{r.b90 ? money(r.b90, currency) : '—'}</td>
                    <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(r.due, currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="text-strong font-semibold">Total</td>
                  <td className="text-center num text-strong font-semibold">{sum((r) => r.count)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.b0), currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.b30), currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.b60), currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.b90), currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.due), currency)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}

function SalesMix({ rows, currency }: { rows: MixRow[]; currency: string }) {
  const [period, setPeriod] = useState<MixRow['period']>('month');
  const inPeriod = rows.filter((r) => r.period === period);
  const grand = inPeriod.reduce((n, r) => n + r.total, 0);

  // Roll the (method × type) rows up by one dimension.
  const rollup = (key: (r: MixRow) => string) => {
    const m = new Map<string, { count: number; total: number; due: number }>();
    for (const r of inPeriod) {
      const k = key(r);
      const cur = m.get(k) ?? { count: 0, total: 0, due: 0 };
      cur.count += r.count;
      cur.total += r.total;
      cur.due += r.due;
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  };

  const table = (title: string, data: [string, { count: number; total: number; due: number }][], label: (k: string) => string) => (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
        <div className="brand" style={{ fontSize: 17 }}>{title}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th className="text-center">Sales</th>
              <th className="text-right">Total</th>
              <th className="text-right">Share</th>
              <th className="text-right">Still owed</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={5} className="text-center" style={{ color: 'var(--color-faint)', padding: 28 }}>No sales in this period.</td></tr>
            ) : (
              data.map(([k, v]) => (
                <tr key={k}>
                  <td className="text-strong font-semibold">{label(k)}</td>
                  <td className="text-center num">{v.count}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(v.total, currency)}</td>
                  <td className="text-right num whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>{grand > 0 ? Math.round((v.total / grand) * 100) : 0}%</td>
                  <td className="text-right num whitespace-nowrap" style={{ color: v.due > 0 ? 'var(--color-warn)' : 'var(--color-faint)' }}>{v.due > 0 ? money(v.due, currency) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex gap-2 mb-4">
        <button className="chip" data-active={period === 'today' || undefined} onClick={() => setPeriod('today')}>Today</button>
        <button className="chip" data-active={period === 'month' || undefined} onClick={() => setPeriod('month')}>This month</button>
        <button className="chip" data-active={period === 'all' || undefined} onClick={() => setPeriod('all')}>All time</button>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {table('By payment method', rollup((r) => r.method), (k) => METHOD_LABEL[k] ?? k)}
        {table('Retail vs wholesale', rollup((r) => r.saleType), (k) => (k === 'WHOLESALE' ? 'Wholesale' : 'Retail'))}
      </div>
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
      {/* Print header (only on paper) */}
      <div className="print-only mb-4">
        <div className="brand" style={{ fontSize: 26 }}>{storeName}</div>
        <div style={{ fontSize: 13 }}>Stock valuation · {scopeLabel} · {todayStr()}</div>
        <hr style={{ margin: '10px 0' }} />
      </div>

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

const ENTITY_LABEL: Record<string, string> = {
  PRODUCT: 'Product',
  USER: 'Staff',
  BRANCH: 'Branch',
  SETTINGS: 'Settings',
  STOCK: 'Stock',
  CATEGORY: 'Category',
  CUSTOMER: 'Customer',
  EXPENSE: 'Expense',
  SALARY: 'Salary',
  WORKER: 'Worker',
  FLOAT: 'Float',
};

function ActivityLog({ rows }: { rows: AuditRow[] }) {
  const [entity, setEntity] = useState('all');
  const entities = Array.from(new Set(rows.map((r) => r.entity)));
  const shown = entity === 'all' ? rows : rows.filter((r) => r.entity === entity);

  return (
    <>
      <div className="flex gap-2 flex-wrap mb-4">
        <button className="chip" data-active={entity === 'all' || undefined} onClick={() => setEntity('all')}>All</button>
        {entities.map((e) => (
          <button key={e} className="chip" data-active={entity === e || undefined} onClick={() => setEntity(e)}>
            {ENTITY_LABEL[e] ?? e}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Area</th>
                <th>What happened</th>
                <th>Changes</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={5} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>Nothing recorded yet.</td></tr>
              ) : (
                shown.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap" style={{ color: 'var(--color-muted)', fontSize: 12 }}>{fmtDateTime(a.createdAt)}</td>
                    <td><span className="chip" style={{ cursor: 'default' }}>{ENTITY_LABEL[a.entity] ?? a.entity}</span></td>
                    <td className="text-strong text-[13.5px]">{a.summary}</td>
                    <td className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                      {a.changes.length === 0
                        ? '—'
                        : a.changes.map((c) => (
                            <div key={c.field}>
                              {c.field}: {c.from} → <b style={{ color: 'var(--color-strong)' }}>{c.to}</b>
                            </div>
                          ))}
                    </td>
                    <td style={{ color: 'var(--color-muted)', fontSize: 12 }}>{a.userName || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
