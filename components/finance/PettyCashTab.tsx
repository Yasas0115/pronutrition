'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, parseAmount } from '@/lib/money';
import { fmtDate, fmtDateTime, todayStr } from '@/lib/dates';
import Modal from '../Modal';
import { toast } from '../toast';
import VoidModal from './VoidModal';
import { addPettyCashAction, voidExpenseAction } from '@/app/finance/actions';
import type { ExpensesData, ExpenseRow } from './types';

const OTHER = '__other__';

export default function PettyCashTab({ data }: { data: ExpensesData }) {
  const router = useRouter();
  const { currency, petty } = data;
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null);

  const live = petty.filter((e) => !e.voidedAt);
  const total = live.reduce((n, e) => n + e.amount, 0);

  // Who took how much in this period.
  const byWorker = useMemo(() => {
    const m = new Map<string, { amount: number; count: number }>();
    for (const e of live) {
      const k = e.workerName ?? 'Unknown';
      const cur = m.get(k) ?? { amount: 0, count: 0 };
      cur.amount += e.amount;
      cur.count += 1;
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].amount - a[1].amount);
  }, [live]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
        <div className="text-[13.5px]" style={{ color: 'var(--color-muted)' }}>
          Cash taken from the till by workers · counted as an expense, never taken off a salary.
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Petty cash</button>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
            <div className="brand" style={{ fontSize: 17 }}>By worker</div>
          </div>
          <table className="table">
            <tbody>
              {byWorker.length === 0 ? (
                <tr><td className="text-center" style={{ color: 'var(--color-faint)', padding: 28 }}>Nothing taken in this period.</td></tr>
              ) : (
                byWorker.map(([name, v]) => (
                  <tr key={name}>
                    <td>
                      <div className="text-strong font-semibold text-[13.5px]">{name}</div>
                      <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{v.count} time{v.count === 1 ? '' : 's'}</div>
                    </td>
                    <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(v.amount, currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {byWorker.length > 0 && (
              <tfoot>
                <tr>
                  <td className="text-strong font-semibold">Total</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(total, currency)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Taken by</th><th>For</th><th>Recorded</th><th className="text-right">Amount</th><th className="no-print"></th></tr>
              </thead>
              <tbody>
                {petty.length === 0 ? (
                  <tr><td colSpan={6} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No petty cash entries in this period.</td></tr>
                ) : (
                  petty.map((e) => {
                    const v = !!e.voidedAt;
                    const strike = v ? 'line-through' : undefined;
                    return (
                      <tr key={e.id} style={{ opacity: v ? 0.55 : 1 }}>
                        <td className="whitespace-nowrap text-[13px]" style={{ textDecoration: strike }}>{fmtDate(e.expenseDate)}</td>
                        <td className="text-strong font-semibold" style={{ textDecoration: strike }}>{e.workerName ?? '—'}</td>
                        <td className="text-[13px]">
                          <span style={{ textDecoration: strike }}>{e.description || '—'}</span>
                          {e.branchName && <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{e.branchName}</div>}
                          {v && <div className="text-[12px]" style={{ color: 'var(--color-brand)' }}>Voided {fmtDateTime(e.voidedAt!)} by {e.voidedByName ?? '—'}: {e.voidReason}</div>}
                        </td>
                        <td className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{e.userName || '—'}<div>{fmtDateTime(e.createdAt)}</div></td>
                        <td className="text-right num whitespace-nowrap text-strong font-semibold" style={{ textDecoration: strike }}>{money(e.amount, currency)}</td>
                        <td className="text-right no-print">
                          {!v && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-brand)' }} onClick={() => setVoiding(e)}>Void</button>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {adding && <PettyCashModal data={data} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); router.refresh(); }} />}
      {voiding && (
        <VoidModal
          title="Void petty cash"
          subject={`${voiding.workerName ?? 'Cash'} — ${money(voiding.amount, currency)} on ${fmtDate(voiding.expenseDate)}`}
          onClose={() => setVoiding(null)}
          onConfirm={async (reason) => {
            const res = await voidExpenseAction(voiding.id, reason);
            if (res.ok) router.refresh();
            return res;
          }}
        />
      )}
    </>
  );
}

function PettyCashModal({ data, onClose, onSaved }: { data: ExpensesData; onClose: () => void; onSaved: () => void }) {
  const { workers, branches, currency, pinnedBranchId, scopeBranchId } = data;
  const active = workers.filter((w) => w.active);
  const [who, setWho] = useState(active[0]?.id ?? OTHER);
  const [otherName, setOtherName] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayStr());
  const [purpose, setPurpose] = useState('');
  const [branchId, setBranchId] = useState<string>(pinnedBranchId ?? scopeBranchId ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (amount <= 0) { toast('Enter the amount.', true); return; }
    if (who === OTHER && !otherName.trim()) { toast('Say who took the cash.', true); return; }
    if (!purpose.trim()) { toast('Say what the cash was for.', true); return; }
    setSaving(true);
    const res = await addPettyCashAction({
      workerId: who === OTHER ? null : who,
      workerName: who === OTHER ? otherName : undefined,
      amount, description: purpose, date, branchId: branchId || null,
    });
    setSaving(false);
    if (res.ok) { toast('Petty cash recorded'); onSaved(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title="Petty cash"
      onClose={onClose}
      maxWidth={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Taken by</label>
            <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
              {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              <option value={OTHER}>Someone else…</option>
            </select>
          </div>
          <div>
            <label className="field-label">Amount ({currency})</label>
            <input className="input num" inputMode="numeric" autoFocus value={amount ? String(amount) : ''} placeholder="0" onChange={(e) => setAmount(parseAmount(e.target.value))} />
          </div>
        </div>
        {who === OTHER && (
          <div>
            <label className="field-label">Name</label>
            <input className="input" value={otherName} onChange={(e) => setOtherName(e.target.value)} />
          </div>
        )}
        <div>
          <label className="field-label">What was it for?</label>
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Tea & snacks, bus fare, courier" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Date</label>
            <input className="input" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Branch</label>
            <select className="input" value={branchId} disabled={!!pinnedBranchId} onChange={(e) => setBranchId(e.target.value)}>
              {!pinnedBranchId && <option value="">Company-wide</option>}
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}
