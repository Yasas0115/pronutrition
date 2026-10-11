'use client';

import { money } from '@/lib/money';
import type { FinanceData } from './types';

const KIND_LABEL: Record<string, string> = { GENERAL: 'Expense', SALARY: 'Salaries', PETTY_CASH: 'Petty cash' };

// One line of the statement: label on the left, amount on the right.
function Line({
  label, value, currency, bold, indent, tone, minus,
}: {
  label: string; value: number; currency: string;
  bold?: boolean; indent?: boolean; tone?: 'good' | 'bad'; minus?: boolean;
}) {
  const color = tone === 'good' ? 'var(--color-ok)' : tone === 'bad' ? 'var(--color-brand)' : undefined;
  return (
    <tr style={bold ? { background: 'var(--color-ink-1)' } : undefined}>
      <td className={bold ? 'text-strong font-semibold' : ''} style={{ paddingLeft: indent ? 28 : undefined, color: bold ? undefined : 'var(--color-ash)' }}>
        {label}
      </td>
      <td className={`text-right num whitespace-nowrap ${bold ? 'text-strong font-semibold' : ''}`} style={{ color }}>
        {minus && value > 0 ? '− ' : ''}{value < 0 ? '− ' : ''}{money(Math.abs(value), currency)}
      </td>
    </tr>
  );
}

export default function ProfitLossTab({ data }: { data: FinanceData }) {
  const { profit: p, currency } = data;
  const net = p.netProfit;
  const share = (n: number) => (p.expenses.total > 0 ? Math.round((n / p.expenses.total) * 100) : 0);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Net sales</div>
          <div className="stat__value">{money(p.sales.net, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{p.sales.count} sale{p.sales.count === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Gross profit</div>
          <div className="stat__value">{money(p.grossProfit, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>after cost of goods</div>
        </div>
        <div className="stat">
          <div className="stat__label">Expenses</div>
          <div className="stat__value">{money(p.expenses.total, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>incl. salaries &amp; petty cash</div>
        </div>
        <div className="stat">
          <div className="stat__label">Net profit</div>
          <div className="stat__value" style={{ color: net >= 0 ? 'var(--color-ok)' : 'var(--color-brand)' }}>
            {net < 0 ? '− ' : ''}{money(Math.abs(net), currency)}
          </div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{p.marginPercent < 0 ? '− ' : ''}{Math.abs(p.marginPercent)}% of net sales</div>
        </div>
      </div>

      {(p.estimatedLines > 0 || p.unknownLines > 0) && (
        <div
          className="text-[13px] rounded-lg px-3 py-2.5 mb-4 no-print"
          style={{ color: 'var(--color-warn)', background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}
        >
          {p.estimatedLines > 0 && (
            <div>
              {p.estimatedLines} sale line{p.estimatedLines === 1 ? ' was' : 's were'} sold before buying prices were
              recorded, so their cost uses today&apos;s buying price — the profit on them is an estimate.
            </div>
          )}
          {p.unknownLines > 0 && (
            <div>
              {p.unknownLines} sale line{p.unknownLines === 1 ? '' : 's'} belong to products that no longer exist and
              have no recorded cost, so they are counted at cost 0.
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
            <div className="brand" style={{ fontSize: 17 }}>Profit &amp; loss</div>
          </div>
          <table className="table">
            <tbody>
              <Line label="Sales before discounts" value={p.sales.gross} currency={currency} />
              <Line label="Discounts given" value={p.sales.discounts} currency={currency} minus indent />
              <Line label="Net sales" value={p.sales.net} currency={currency} bold />
              <Line label="Cost of goods sold" value={p.sales.cogs} currency={currency} minus indent />
              <Line label="Gross profit" value={p.grossProfit} currency={currency} bold />
              <Line label="General expenses" value={p.expenses.general} currency={currency} minus indent />
              <Line label="Worker salaries" value={p.expenses.salary} currency={currency} minus indent />
              <Line label="Petty cash" value={p.expenses.pettyCash} currency={currency} minus indent />
              <Line label="Total expenses" value={p.expenses.total} currency={currency} bold />
              <Line label="Net profit" value={net} currency={currency} bold tone={net >= 0 ? 'good' : 'bad'} />
            </tbody>
          </table>
          {p.sales.tax > 0 && (
            <div className="px-4 py-3 text-[12px]" style={{ color: 'var(--color-muted)', borderTop: '1px solid var(--color-line)' }}>
              Tax collected {money(p.sales.tax, currency)} is not part of these figures.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="card overflow-hidden">
            <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
              <div className="brand" style={{ fontSize: 17 }}>Retail vs wholesale</div>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th></th><th className="text-center">Sales</th><th className="text-right">Net sales</th><th className="text-right">Cost</th><th className="text-right">Gross profit</th></tr>
                </thead>
                <tbody>
                  {(['RETAIL', 'WHOLESALE'] as const).map((k) => {
                    const t = p.byType[k];
                    return (
                      <tr key={k}>
                        <td className="text-strong font-semibold">{k === 'RETAIL' ? 'Retail' : 'Wholesale'}</td>
                        <td className="text-center num">{t.count}</td>
                        <td className="text-right num whitespace-nowrap">{money(t.net, currency)}</td>
                        <td className="text-right num whitespace-nowrap">{money(t.cogs, currency)}</td>
                        <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(t.grossProfit, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
              <div className="brand" style={{ fontSize: 17 }}>Where the money went</div>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <tbody>
                  {p.expenses.lines.length === 0 ? (
                    <tr><td className="text-center" style={{ color: 'var(--color-faint)', padding: 28 }}>No expenses in this period.</td></tr>
                  ) : (
                    p.expenses.lines.map((l) => (
                      <tr key={`${l.kind}:${l.category}`}>
                        <td>
                          <div className="text-strong font-semibold text-[13.5px]">{l.category}</div>
                          <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                            {KIND_LABEL[l.kind] ?? l.kind} · {l.count} entr{l.count === 1 ? 'y' : 'ies'}
                          </div>
                        </td>
                        <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(l.amount, currency)}</td>
                        <td className="text-right num" style={{ color: 'var(--color-muted)', width: 56 }}>{share(l.amount)}%</td>
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
  );
}
