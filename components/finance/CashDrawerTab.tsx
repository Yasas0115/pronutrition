'use client';

import { money } from '@/lib/money';
import type { FinanceData } from './types';

function Row({
  label, value, currency, sign, bold, hint,
}: {
  label: string; value: number; currency: string; sign?: '+' | '−'; bold?: boolean; hint?: string;
}) {
  return (
    <tr style={bold ? { background: 'var(--color-ink-1)' } : undefined}>
      <td className={bold ? 'text-strong font-semibold' : ''} style={{ color: bold ? undefined : 'var(--color-ash)' }}>
        {label}
        {hint && <div className="text-[12px]" style={{ color: 'var(--color-faint)' }}>{hint}</div>}
      </td>
      <td className={`text-right num whitespace-nowrap ${bold ? 'text-strong font-semibold' : ''}`}>
        {value < 0 ? '− ' : sign && value > 0 ? `${sign} ` : ''}{money(Math.abs(value), currency)}
      </td>
    </tr>
  );
}

export default function CashDrawerTab({ data }: { data: FinanceData }) {
  const { drawer: d, currency } = data;
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
          <div className="brand" style={{ fontSize: 17 }}>Cash that should be in the drawer</div>
        </div>
        <table className="table">
          <tbody>
            <Row label="Till float" value={d.float} currency={currency} hint="the fixed change fund in force at the end of the period" />
            <Row label="Cash sales" value={d.cashSales} currency={currency} sign="+" hint="cash taken at the till" />
            <Row label="Credit payments received in cash" value={d.cashSettlements} currency={currency} sign="+" />
            <Row label="Expenses paid in cash" value={d.cashExpenses} currency={currency} sign="−" />
            <Row label="Salaries paid in cash" value={d.cashSalaries} currency={currency} sign="−" />
            <Row label="Petty cash" value={d.cashPettyCash} currency={currency} sign="−" />
            <Row label="Expected cash in drawer" value={d.expected} currency={currency} bold />
          </tbody>
        </table>
      </div>
      <div className="card p-4 text-[13px]" style={{ color: 'var(--color-muted)' }}>
        <div className="brand mb-2" style={{ fontSize: 15 }}>How to use this</div>
        Count the cash in the drawer and compare it with the expected amount. A gap means a missed entry, a wrong
        change amount or cash that was banked — check the Expenses and Petty cash tabs for the period.
        <div className="mt-2">
          Card, bank-transfer and Koko money never goes in the drawer, so it is left out on both sides. Voided
          entries are not counted.
        </div>
      </div>
    </div>
  );
}
