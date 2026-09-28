'use client';

import { useState } from 'react';
import { money } from '@/lib/money';
import { fmtDateTime, fmtTime, todayStr } from '@/lib/dates';
import Modal from './Modal';

type SaleItem = { name: string; qty: number; price: number; lineTotal: number };
type Sale = {
  id: string;
  number: number;
  createdAt: string;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  paid: number;
  change: number;
  method: string;
  branchName: string | null;
  customerName: string | null;
  cashierName: string | null;
  items: SaleItem[];
};

export default function SalesView({
  stats,
  topProducts,
  sales,
  branchBreakdown,
  showBranchColumn = false,
  scopeLabel,
  currency,
  storeName,
}: {
  stats: {
    todayRevenue: number; todayCount: number;
    monthRevenue: number; monthCount: number;
    totalRevenue: number; totalCount: number;
  };
  topProducts: { name: string; qty: number; revenue: number }[];
  sales: Sale[];
  branchBreakdown: { name: string; revenue: number; count: number }[];
  showBranchColumn?: boolean;
  scopeLabel: string;
  currency: string;
  storeName: string;
}) {
  const [detail, setDetail] = useState<Sale | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5 no-print">
        <div>
          <h1 className="page-title">Sales &amp; Reports</h1>
          <p className="page-sub">
            Takings for <b style={{ color: 'var(--color-strong)' }}>{scopeLabel}</b> · switch branch from the top bar.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => window.print()}>Print report</button>
      </div>

      {/* Print header (only on paper) */}
      <div className="print-only mb-4">
        <div className="brand" style={{ fontSize: 26 }}>{storeName}</div>
        <div style={{ fontSize: 13 }}>Sales report · {todayStr()}</div>
        <hr style={{ margin: '10px 0' }} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Today</div>
          <div className="stat__value accent">{money(stats.todayRevenue, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{stats.todayCount} sale{stats.todayCount === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="stat__label">This month</div>
          <div className="stat__value">{money(stats.monthRevenue, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{stats.monthCount} sale{stats.monthCount === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="stat__label">All-time revenue</div>
          <div className="stat__value">{money(stats.totalRevenue, currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Total receipts</div>
          <div className="stat__value">{stats.totalCount}</div>
        </div>
      </div>

      {/* Per-branch revenue roll-up (only meaningful across all branches) */}
      {showBranchColumn && branchBreakdown.length > 1 && (
        <div className="card overflow-hidden mb-5">
          <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
            <div className="brand" style={{ fontSize: 17 }}>Revenue by branch</div>
          </div>
          <table className="table">
            <thead>
              <tr><th>Branch</th><th className="text-center">Sales</th><th className="text-right">Revenue</th></tr>
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
                        <td className="text-[13px]">{fmtDateTime(s.createdAt)}</td>
                        <td className="text-center num">{s.items.reduce((a, b) => a + b.qty, 0)}</td>
                        <td><span className="badge" style={{ color: 'var(--color-muted)', background: 'var(--color-ink-1)' }}>{s.method}</span></td>
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

      {detail && (
        <Modal title={`Receipt #${detail.number}`} onClose={() => setDetail(null)} maxWidth={440}
          footer={<button className="btn btn-primary" onClick={() => setDetail(null)}>Close</button>}>
          <div className="receipt">
            <div className="text-[12px] mb-2" style={{ color: 'var(--color-muted)' }}>
              {fmtDateTime(detail.createdAt)} · {fmtTime(detail.createdAt)} · {detail.cashierName}
            </div>
            {detail.items.map((i, idx) => (
              <div className="receipt__line" key={idx}>
                <span>{i.name} <span style={{ color: 'var(--color-faint)' }}>× {i.qty}</span></span>
                <span className="num">{money(i.lineTotal, currency)}</span>
              </div>
            ))}
            <hr className="receipt__hr" />
            <div className="receipt__line"><span>Subtotal</span><span className="num">{money(detail.subtotal, currency)}</span></div>
            {detail.discount > 0 && <div className="receipt__line"><span>Discount</span><span className="num">− {money(detail.discount, currency)}</span></div>}
            {detail.tax > 0 && <div className="receipt__line"><span>Tax</span><span className="num">{money(detail.tax, currency)}</span></div>}
            <div className="receipt__line" style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, color: 'var(--color-strong)' }}>
              <span>TOTAL</span><span className="num" style={{ color: 'var(--color-brand)' }}>{money(detail.total, currency)}</span>
            </div>
            <div className="receipt__line" style={{ marginTop: 4 }}><span>Paid ({detail.method})</span><span className="num">{money(detail.paid, currency)}</span></div>
            {detail.change > 0 && <div className="receipt__line"><span>Change</span><span className="num">{money(detail.change, currency)}</span></div>}
          </div>
        </Modal>
      )}
    </>
  );
}
