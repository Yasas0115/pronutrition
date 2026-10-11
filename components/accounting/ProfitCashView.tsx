'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, parseDay } from '@/lib/dates';
import ProfitLossTab from '../finance/ProfitLossTab';
import CashDrawerTab from '../finance/CashDrawerTab';
import type { ProfitData } from '../finance/types';
import PrintHeader from './PrintHeader';
import RangeBar from './RangeBar';

type Tab = 'profit' | 'drawer';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profit', label: 'Profit & loss' },
  { key: 'drawer', label: 'Cash drawer & float' },
];

export default function ProfitCashView({ data }: { data: ProfitData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('profit');
  const { fromStr, toStr } = data;

  const go = (next: { from?: string; to?: string }) => {
    const q = new URLSearchParams({ from: next.from ?? fromStr, to: next.to ?? toStr });
    router.replace(`/accounting/profit?${q.toString()}`, { scroll: false });
  };

  const periodLabel = `${fmtDate(parseDay(fromStr) ?? new Date())} – ${fmtDate(parseDay(toStr) ?? new Date())}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5 no-print">
        <div>
          <h1 className="page-title">Profit &amp; Cash</h1>
          <p className="page-sub">
            What was earned, and what should be in the till, for{' '}
            <b style={{ color: 'var(--color-strong)' }}>{data.scopeLabel}</b> · switch branch from the top bar.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>
      </div>

      <PrintHeader
        storeName={data.storeName}
        line={`${TABS.find((t) => t.key === tab)?.label} · ${data.scopeLabel} · ${periodLabel}`}
      />

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        {TABS.map((t) => (
          <button key={t.key} className="chip" data-active={tab === t.key || undefined} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <RangeBar fromStr={fromStr} toStr={toStr} onChange={go} />

      {tab === 'profit' && <ProfitLossTab data={data} />}
      {tab === 'drawer' && <CashDrawerTab data={data} />}
    </>
  );
}
