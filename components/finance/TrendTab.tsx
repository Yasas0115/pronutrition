'use client';

import { Fragment, useState } from 'react';
import { money } from '@/lib/money';
import { fmtDate } from '@/lib/dates';
import type { ProfitData, TrendBucket, TrendGranularity } from './types';

const MODES: { key: TrendGranularity; label: string }[] = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
];

function labelOf(g: TrendGranularity, key: string): string {
  if (g === 'month') {
    return new Date(`${key}-15T00:00:00Z`).toLocaleDateString('en-LK', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const d = fmtDate(new Date(`${key}T00:00:00+05:30`));
  return g === 'week' ? `Week of ${d}` : d;
}

const shortLabel = (g: TrendGranularity, key: string) =>
  g === 'month' ? key.slice(2).replace('-', '/') : `${key.slice(8)}/${key.slice(5, 7)}`;

// Sales, expenses and net profit side by side for every period. The chart is
// for the shape; the table below it carries the exact figures.
function Chart({ rows, g, currency }: { rows: TrendBucket[]; g: TrendGranularity; currency: string }) {
  const W = Math.max(640, rows.length * 44);
  const H = 220;
  const padT = 12;
  const padB = 26;
  const padL = 4;
  const max = Math.max(1, ...rows.flatMap((r) => [r.net, r.expenses, r.netProfit]));
  const min = Math.min(0, ...rows.map((r) => r.netProfit));
  const span = max - min || 1;
  const y = (v: number) => padT + ((max - v) / span) * (H - padT - padB);
  const slot = (W - padL) / Math.max(1, rows.length);
  const bw = Math.max(4, Math.min(14, (slot - 8) / 3));
  const bar = (x: number, v: number, color: string, tip: string) => (
    <rect x={x} y={Math.min(y(v), y(0))} width={bw} height={Math.max(1, Math.abs(y(v) - y(0)))} fill={color} rx={1.5}>
      <title>{tip}</title>
    </rect>
  );
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Sales, expenses and net profit per period" style={{ display: 'block' }}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line-2)" />
        {rows.map((r, i) => {
          const x0 = padL + i * slot + (slot - bw * 3 - 4) / 2;
          const name = labelOf(g, r.key);
          return (
            <g key={r.key}>
              {bar(x0, r.net, '#3b82f6', `${name} · Sales ${money(r.net, currency)}`)}
              {bar(x0 + bw + 2, r.expenses, '#f59e0b', `${name} · Expenses ${money(r.expenses, currency)}`)}
              {bar(x0 + (bw + 2) * 2, r.netProfit, r.netProfit >= 0 ? '#22c55e' : '#ef4444', `${name} · Net profit ${money(r.netProfit, currency)}`)}
              {(rows.length <= 16 || i % Math.ceil(rows.length / 16) === 0) && (
                <text x={padL + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)">
                  {shortLabel(g, r.key)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <i style={{ background: color, display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 6 }} />
      {label}
    </span>
  );
}

export default function TrendTab({ data }: { data: ProfitData }) {
  const { currency, trend, outstandingCredit } = data;
  const [g, setG] = useState<TrendGranularity>('day');
  const [open, setOpen] = useState<string | null>(null);
  const rows = trend[g];
  const sum = (f: (r: TrendBucket) => number) => rows.reduce((n, r) => n + f(r), 0);

  const tot = {
    net: sum((r) => r.net),
    cogs: sum((r) => r.cogs),
    expenses: sum((r) => r.expenses),
    profit: sum((r) => r.netProfit),
    given: sum((r) => r.creditGiven),
    collected: sum((r) => r.creditCollected),
  };
  const signed = (n: number) => `${n < 0 ? '− ' : ''}${money(Math.abs(n), currency)}`;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Net sales</div>
          <div className="stat__value">{money(tot.net, currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Expenses</div>
          <div className="stat__value">{money(tot.expenses, currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Net profit</div>
          <div className="stat__value" style={{ color: tot.profit >= 0 ? 'var(--color-ok)' : 'var(--color-brand)' }}>{signed(tot.profit)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>till float not included</div>
        </div>
        <div className="stat">
          <div className="stat__label">Credit given</div>
          <div className="stat__value">{money(tot.given, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{money(tot.collected, currency)} collected back</div>
        </div>
        <div className="stat">
          <div className="stat__label">Customers still owe</div>
          <div className="stat__value" style={{ color: 'var(--color-warn)' }}>{money(outstandingCredit, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>right now, all time</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 no-print">
        {MODES.map((m) => (
          <button key={m.key} className="chip" data-active={g === m.key || undefined} onClick={() => { setG(m.key); setOpen(null); }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap gap-4 text-[12.5px] mb-2" style={{ color: 'var(--color-muted)' }}>
          <Swatch color="#3b82f6" label="Sales" />
          <Swatch color="#f59e0b" label="Expenses" />
          <Swatch color="#22c55e" label="Net profit" />
        </div>
        <Chart rows={rows} g={g} currency={currency} />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{g === 'day' ? 'Day' : g === 'week' ? 'Week' : 'Month'}</th>
                <th className="text-right">Net sales</th>
                <th className="text-right">Cost of goods</th>
                <th className="text-right">Expenses</th>
                <th className="text-right">Net profit</th>
                <th className="text-right">Credit given</th>
                <th className="text-right">Credit collected</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => {
                const expandable = r.expenseLines.length > 0;
                const isOpen = open === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr onClick={expandable ? () => setOpen(isOpen ? null : r.key) : undefined} style={{ cursor: expandable ? 'pointer' : undefined }}>
                      <td className="whitespace-nowrap">{expandable ? (isOpen ? '▾ ' : '▸ ') : ''}{labelOf(g, r.key)}</td>
                      <td className="text-right num">{money(r.net, currency)}</td>
                      <td className="text-right num">{money(r.cogs, currency)}</td>
                      <td className="text-right num">{money(r.expenses, currency)}</td>
                      <td className="text-right num font-semibold" style={{ color: r.netProfit < 0 ? 'var(--color-brand)' : undefined }}>
                        {signed(r.netProfit)}
                      </td>
                      <td className="text-right num">{r.creditGiven ? money(r.creditGiven, currency) : '—'}</td>
                      <td className="text-right num">{r.creditCollected ? money(r.creditCollected, currency) : '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--color-ink-1)' }}>
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] py-1">
                            {r.expenseLines.map((l) => (
                              <span key={l.category}>{l.category}: <b className="num">{money(l.amount, currency)}</b></span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr style={{ background: 'var(--color-ink-1)' }}>
                <td className="text-strong font-semibold">Total</td>
                <td className="text-right num font-semibold">{money(tot.net, currency)}</td>
                <td className="text-right num font-semibold">{money(tot.cogs, currency)}</td>
                <td className="text-right num font-semibold">{money(tot.expenses, currency)}</td>
                <td className="text-right num font-semibold">{signed(tot.profit)}</td>
                <td className="text-right num font-semibold">{money(tot.given, currency)}</td>
                <td className="text-right num font-semibold">{money(tot.collected, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[12px] mt-3" style={{ color: 'var(--color-muted)' }}>
        Net profit = net sales − cost of goods − expenses. The till float is never counted. Credit sits beside
        profit: “given” is what customers took without paying, “collected” is what they paid back in the period.
        Click a day, week or month with expenses to see their names.
      </p>
    </>
  );
}
