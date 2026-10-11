'use client';

import { useState } from 'react';
import { money } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import type { Receipt } from '@/app/actions';
import ReceiptModal from '../ReceiptModal';
import PrintHeader from './PrintHeader';

// A receipt as listed here: everything the receipt needs, plus the pay-method badge.
type SaleRow = Receipt & { id: string };

export type MixRow = {
  period: 'today' | 'month' | 'all';
  method: string;
  saleType: string; // RETAIL | WHOLESALE
  count: number;
  total: number;
  due: number;
};

export type SalesStats = {
  today: { takings: number; net: number; count: number };
  month: { takings: number; net: number; count: number };
  all: { takings: number; net: number; count: number };
};

type Tab = 'overview' | 'mix';

export default function SalesView({
  stats,
  topProducts,
  sales,
  branchBreakdown,
  mix,
  methodLabels,
  showBranchColumn = false,
  scopeLabel,
  currency,
  store,
}: {
  stats: SalesStats;
  topProducts: { name: string; qty: number; revenue: number }[];
  sales: SaleRow[];
  branchBreakdown: { name: string; revenue: number; count: number }[];
  mix: MixRow[];
  methodLabels: Record<string, string>;
  showBranchColumn?: boolean;
  scopeLabel: string;
  currency: string;
  store: { name: string; phone: string | null; address: string | null; note: string | null };
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [detail, setDetail] = useState<SaleRow | null>(null);

  const sub = (s: { count: number; net: number }) =>
    `${s.count} sale${s.count === 1 ? '' : 's'} · net ${money(s.net, currency)}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5 no-print">
        <div>
          <h1 className="page-title">Sales</h1>
          <p className="page-sub">
            Takings for <b style={{ color: 'var(--color-strong)' }}>{scopeLabel}</b> · switch branch from the top bar.
          </p>
        </div>
        {tab === 'overview' && <button className="btn btn-ghost" onClick={() => window.print()}>Print report</button>}
      </div>

      <PrintHeader storeName={store.name} line={`Sales report · ${scopeLabel}`} />

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        <button className="chip" data-active={tab === 'overview' || undefined} onClick={() => setTab('overview')}>Takings &amp; receipts</button>
        <button className="chip" data-active={tab === 'mix' || undefined} onClick={() => setTab('mix')}>Sales mix</button>
      </div>

      {tab === 'mix' ? (
        <SalesMix rows={mix} currency={currency} methodLabels={methodLabels} />
      ) : (
        <>
          {/* KPIs. Takings = what customers were charged (tax included). Net is what
              profit is measured on — the same figure Profit & Cash shows. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="stat">
              <div className="stat__label">Takings today</div>
              <div className="stat__value accent">{money(stats.today.takings, currency)}</div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{sub(stats.today)}</div>
            </div>
            <div className="stat">
              <div className="stat__label">Takings this month</div>
              <div className="stat__value">{money(stats.month.takings, currency)}</div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{sub(stats.month)}</div>
            </div>
            <div className="stat">
              <div className="stat__label">All-time takings</div>
              <div className="stat__value">{money(stats.all.takings, currency)}</div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>net {money(stats.all.net, currency)}</div>
            </div>
            <div className="stat">
              <div className="stat__label">Total receipts</div>
              <div className="stat__value">{stats.all.count}</div>
            </div>
          </div>
          <p className="text-[12.5px] mb-5 -mt-2" style={{ color: 'var(--color-muted)' }}>
            Takings include tax and credit not yet paid. Net is after discounts and before tax — the figure profit is measured on.
          </p>

          {/* Per-branch revenue roll-up (only meaningful across all branches) */}
          {showBranchColumn && branchBreakdown.length > 1 && (
            <div className="card overflow-hidden mb-5">
              <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
                <div className="brand" style={{ fontSize: 17 }}>Takings by branch</div>
              </div>
              <table className="table">
                <thead>
                  <tr><th>Branch</th><th className="text-center">Sales</th><th className="text-right">Takings</th></tr>
                </thead>
                <tbody>
                  {branchBreakdown.map((b, i) => (
                    <tr key={i}>
                      <td className="text-strong font-semibold">{b.name}</td>
                      <td className="text-center num">{b.count}</td>
                      <td className="text-right num text-strong font-semibold">{money(b.revenue, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="lg:flex lg:gap-6 lg:items-start">
            {/* Top products */}
            <div className="lg:w-[360px] shrink-0 mb-5 lg:mb-0">
              <div className="card overflow-hidden">
                <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
                  <div className="brand" style={{ fontSize: 17 }}>Best sellers</div>
                </div>
                {topProducts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[13.5px]" style={{ color: 'var(--color-faint)' }}>No sales yet.</div>
                ) : (
                  <table className="table">
                    <tbody>
                      {topProducts.map((t, i) => (
                        <tr key={i}>
                          <td>
                            <div className="text-strong font-semibold text-[13.5px]">{t.name}</div>
                            <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{t.qty} sold</div>
                          </td>
                          <td className="text-right num text-strong font-semibold">{money(t.revenue, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Recent sales */}
            <div className="flex-1 min-w-0">
              <div className="card overflow-hidden">
                <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
                  <div className="brand" style={{ fontSize: 17 }}>Recent sales</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        {showBranchColumn && <th>Branch</th>}
                        <th>When</th>
                        <th className="text-center">Items</th>
                        <th>Pay</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.length === 0 ? (
                        <tr><td colSpan={showBranchColumn ? 6 : 5} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No sales recorded yet.</td></tr>
                      ) : (
                        sales.map((s) => (
                          <tr key={s.id} className="cursor-pointer" onClick={() => setDetail(s)}>
                            <td>
                              <div className="text-strong font-semibold num">#{s.number}</div>
                              <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{s.customerName ?? 'Walk-in'}</div>
                            </td>
                            {showBranchColumn && <td className="text-[13px]">{s.branchName ?? '—'}</td>}
                            <td className="text-[13px] whitespace-nowrap">{fmtDateTime(s.createdAt)}</td>
                            <td className="text-center num">{s.items.reduce((a, b) => a + b.qty, 0)}</td>
                            <td className="whitespace-nowrap">
                              <span className="badge" style={{ color: 'var(--color-muted)', background: 'var(--color-ink-1)' }}>{methodLabels[s.method] ?? s.method}</span>
                              {s.saleType === 'WHOLESALE' && (
                                <span className="badge ml-1" style={{ color: 'var(--color-strong)', background: 'var(--color-ink-1)' }}>Wholesale</span>
                              )}
                              {s.balanceDue > 0 && (
                                <span className="badge ml-1" style={{ color: 'var(--color-warn)', background: 'var(--color-ink-1)' }}>
                                  Due {money(s.balanceDue, currency)}
                                </span>
                              )}
                            </td>
                            <td className="text-right num text-strong font-semibold">{money(s.total, currency)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {detail && (
        <ReceiptModal
          receipt={detail}
          currency={currency}
          store={store}
          closeLabel="Close"
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

// Sales rolled up by payment method and by retail / wholesale for one period.
function SalesMix({
  rows,
  currency,
  methodLabels,
}: {
  rows: MixRow[];
  currency: string;
  methodLabels: Record<string, string>;
}) {
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
        {table('By payment method', rollup((r) => r.method), (k) => methodLabels[k] ?? k)}
        {table('Retail vs wholesale', rollup((r) => r.saleType), (k) => (k === 'WHOLESALE' ? 'Wholesale' : 'Retail'))}
      </div>
    </>
  );
}
