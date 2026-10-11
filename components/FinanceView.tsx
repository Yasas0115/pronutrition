'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, todayStr, startOfMonth, monthKey, monthRange, parseDay } from '@/lib/dates';
import ProfitLossTab from './finance/ProfitLossTab';
import ExpensesTab from './finance/ExpensesTab';
import SalariesTab from './finance/SalariesTab';
import PettyCashTab from './finance/PettyCashTab';
import FloatTab from './finance/FloatTab';
import CashDrawerTab from './finance/CashDrawerTab';
import type { FinanceData } from './finance/types';

type Tab = 'profit' | 'expenses' | 'salaries' | 'petty' | 'drawer' | 'float';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profit', label: 'Profit & loss' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'salaries', label: 'Salaries' },
  { key: 'petty', label: 'Petty cash' },
  { key: 'drawer', label: 'Cash drawer' },
  { key: 'float', label: 'Float' },
];

// Tabs that report over the From/To range. Salaries use their own month and
// Float is a live setting, so the range bar is hidden there.
const RANGE_TABS: Tab[] = ['profit', 'expenses', 'petty', 'drawer'];

export default function FinanceView({ data }: { data: FinanceData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('profit');
  const { fromStr, toStr, month } = data;

  const go = (next: { from?: string; to?: string; month?: string }) => {
    const q = new URLSearchParams({
      from: next.from ?? fromStr,
      to: next.to ?? toStr,
      month: next.month ?? month,
    });
    router.replace(`/finance?${q.toString()}`, { scroll: false });
  };

  const today = todayStr();
  const monthStart = todayStr(startOfMonth());
  const prev = (() => {
    const [y, m] = monthKey().split('-').map(Number);
    const key = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const r = monthRange(key)!;
    return { from: todayStr(r.start), to: todayStr(r.end) };
  })();

  const presets = [
    { label: 'Today', from: today, to: today },
    { label: 'This month', from: monthStart, to: today },
    { label: 'Last month', from: prev.from, to: prev.to },
    { label: 'All time', from: '2000-01-01', to: today },
  ];

  const showRange = RANGE_TABS.includes(tab);
  const periodLabel = `${fmtDate(parseDay(fromStr) ?? new Date())} – ${fmtDate(parseDay(toStr) ?? new Date())}`;
  const canPrint = tab === 'profit' || tab === 'drawer' || tab === 'expenses' || tab === 'petty';

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5 no-print">
        <div>
          <h1 className="page-title">Profit &amp; Expenses</h1>
          <p className="page-sub">
            Profit, expenses, salaries and the till for <b style={{ color: 'var(--color-strong)' }}>{data.scopeLabel}</b> · switch branch from the top bar.
          </p>
        </div>
        {canPrint && <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>}
      </div>

      {/* Print header (only on paper) */}
      <div className="print-only mb-4">
        <div className="brand" style={{ fontSize: 26 }}>{data.storeName}</div>
        <div style={{ fontSize: 13 }}>
          {TABS.find((t) => t.key === tab)?.label} · {data.scopeLabel}
          {showRange && ` · ${periodLabel}`}
        </div>
        <hr style={{ margin: '10px 0' }} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        {TABS.map((t) => (
          <button key={t.key} className="chip" data-active={tab === t.key || undefined} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {showRange && (
        <div className="card p-3 mb-5 flex flex-wrap items-end gap-3 no-print">
          <div>
            <label className="field-label">From</label>
            <input className="input" type="date" value={fromStr} max={toStr} onChange={(e) => e.target.value && go({ from: e.target.value })} />
          </div>
          <div>
            <label className="field-label">To</label>
            <input className="input" type="date" value={toStr} min={fromStr} max={today} onChange={(e) => e.target.value && go({ to: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                className="chip"
                data-active={(p.from === fromStr && p.to === toStr) || undefined}
                onClick={() => go({ from: p.from, to: p.to })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'profit' && <ProfitLossTab data={data} />}
      {tab === 'expenses' && <ExpensesTab data={data} />}
      {tab === 'salaries' && <SalariesTab data={data} onMonthChange={(m) => go({ month: m })} />}
      {tab === 'petty' && <PettyCashTab data={data} />}
      {tab === 'drawer' && <CashDrawerTab data={data} />}
      {tab === 'float' && <FloatTab data={data} />}
    </>
  );
}
