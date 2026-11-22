'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, parseDay } from '@/lib/dates';
import ExpensesTab from '../finance/ExpensesTab';
import SalariesTab from '../finance/SalariesTab';
import type { ExpensesData } from '../finance/types';
import PrintHeader from './PrintHeader';
import RangeBar from './RangeBar';
import { useT } from '@/components/I18nProvider';

type Tab = 'expenses' | 'salaries';

const TABS: { key: Tab; label: string }[] = [
  { key: 'expenses', label: 'Expenses' },
  { key: 'salaries', label: 'Salaries' },
];

// Expenses report over the From/To range; salaries use their own
// month, so the range bar is hidden there.
export default function ExpensesPayrollView({ data }: { data: ExpensesData }) {
  const tx = useT();
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
          <h1 className="page-title">{tx("Expenses & Payroll")}</h1>
          <p className="page-sub">
            {tx("Money going out — expenses and worker salaries for")}
            <b style={{ color: 'var(--color-strong)' }}>{tx(data.scopeLabel)}</b>{' '}{tx("· switch branch from the top bar.")}
          </p>
        </div>
        {showRange && <button className="btn btn-ghost" onClick={() => window.print()}>{tx("Print")}</button>}
      </div>

      <PrintHeader
        storeName={data.storeName}
        line={`${tx(TABS.find((x) => x.key === tab)?.label)} · ${tx(data.scopeLabel)}${showRange ? ` · ${periodLabel}` : ''}`}
      />

      <div className="flex flex-wrap gap-2 mb-4 no-print" hidden={data.limited}>
        {TABS.map((t) => (
          <button key={t.key} className="chip" data-active={tab === t.key || undefined} onClick={() => setTab(t.key)}>
            {tx(t.label)}
          </button>
        ))}
      </div>

      {showRange && <RangeBar fromStr={fromStr} toStr={toStr} onChange={go} />}

      {tab === 'expenses' && <ExpensesTab data={data} />}
      {tab === 'salaries' && <SalariesTab data={data} onMonthChange={(m) => go({ month: m })} />}
    </>
  );
}
