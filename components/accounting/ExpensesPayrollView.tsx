'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, parseDay } from '@/lib/dates';
import ExpensesTab from '../finance/ExpensesTab';
import PettyCashTab from '../finance/PettyCashTab';
import SalariesTab from '../finance/SalariesTab';
import type { ExpensesData } from '../finance/types';
import PrintHeader from './PrintHeader';
import RangeBar from './RangeBar';

type Tab = 'expenses' | 'petty' | 'salaries';

const TABS: { key: Tab; label: string }[] = [
  { key: 'expenses', label: 'Expenses' },
  { key: 'petty', label: 'Petty cash' },
  { key: 'salaries', label: 'Salaries' },
];

// Expenses and petty cash report over the From/To range; salaries use their own
// month, so the range bar is hidden there.
export default function ExpensesPayrollView({ data }: { data: ExpensesData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('expenses');
  const { fromStr, toStr, month } = data;

  const go = (next: { from?: string; to?: string; month?: string }) => {
    const q = new URLSearchParams({
      from: next.from ?? fromStr,
      to: next.to ?? toStr,
      month: next.month ?? month,
    });
    router.replace(`/accounting/expenses?${q.toString()}`, { scroll: false });
  };

  const showRange = tab !== 'salaries';
  const periodLabel = `${fmtDate(parseDay(fromStr) ?? new Date())} – ${fmtDate(parseDay(toStr) ?? new Date())}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5 no-print">
        <div>
          <h1 className="page-title">Expenses &amp; Payroll</h1>
          <p className="page-sub">
            Money going out — expenses, petty cash and worker salaries for{' '}
            <b style={{ color: 'var(--color-strong)' }}>{data.scopeLabel}</b> · switch branch from the top bar.
          </p>
        </div>
        {showRange && <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>}
      </div>

      <PrintHeader
        storeName={data.storeName}
        line={`${TABS.find((t) => t.key === tab)?.label} · ${data.scopeLabel}${showRange ? ` · ${periodLabel}` : ''}`}
      />

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        {TABS.map((t) => (
          <button key={t.key} className="chip" data-active={tab === t.key || undefined} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {showRange && <RangeBar fromStr={fromStr} toStr={toStr} onChange={go} />}

      {tab === 'expenses' && <ExpensesTab data={data} />}
      {tab === 'petty' && <PettyCashTab data={data} />}
      {tab === 'salaries' && <SalariesTab data={data} onMonthChange={(m) => go({ month: m })} />}
    </>
  );
}
