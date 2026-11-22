'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, parseDay } from '@/lib/dates';
import ProfitLossTab from '../finance/ProfitLossTab';
import CashDrawerTab from '../finance/CashDrawerTab';
import TrendTab from '../finance/TrendTab';
import type { ProfitData } from '../finance/types';
import PrintHeader from './PrintHeader';
import RangeBar from './RangeBar';
import { useT } from '@/components/I18nProvider';

type Tab = 'profit' | 'trend' | 'drawer';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profit', label: 'Profit & loss' },
  { key: 'trend', label: 'Day / week / month' },
  { key: 'drawer', label: 'Cash drawer & float' },
];

export default function ProfitCashView({ data }: { data: ProfitData }) {
  const tx = useT();
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
          <h1 className="page-title">{tx("Profit & Cash")}</h1>
          <p className="page-sub">
            {tx("What was earned, and what should be in the till, for")}
            <b style={{ color: 'var(--color-strong)' }}>{tx(data.scopeLabel)}</b>{' '}{tx("· switch branch from the top bar.")}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => window.print()}>{tx("Print")}</button>
      </div>

      <PrintHeader
        storeName={data.storeName}
        line={`${tx(TABS.find((x) => x.key === tab)?.label)} · ${tx(data.scopeLabel)} · ${periodLabel}`}
      />

      <div className="flex flex-wrap gap-2 mb-4 no-print">
        {TABS.map((t) => (
          <button key={t.key} className="chip" data-active={tab === t.key || undefined} onClick={() => setTab(t.key)}>
            {tx(t.label)}
          </button>
        ))}
      </div>

      <RangeBar fromStr={fromStr} toStr={toStr} onChange={go} />

      {tab === 'profit' && <ProfitLossTab data={data} />}
      {tab === 'trend' && <TrendTab data={data} />}
      {tab === 'drawer' && <CashDrawerTab data={data} />}
    </>
  );
}
