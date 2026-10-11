'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, fmt, parseAmount } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import Modal from '../Modal';
import { toast } from '../toast';
import { setFloatAction } from '@/app/finance/actions';
import type { ProfitData, FloatRow } from './types';

export default function FloatTab({ data }: { data: ProfitData }) {
  const router = useRouter();
  const { currency, floats, floatHistory, pinnedBranchId } = data;
  const [editing, setEditing] = useState<FloatRow | null>(null);

  return (
    <>
      <p className="text-[13.5px] mb-4" style={{ color: 'var(--color-muted)' }}>
        The float is the fixed amount of cash kept in each till as change. It is not income or an expense, so it
        never changes profit — but every change is recorded here and the cash-drawer report uses the float that was
        in force.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {floats.length === 0 && <div className="card p-6 text-center" style={{ color: 'var(--color-faint)' }}>No branches yet.</div>}
        {floats.map((f) => (
          <div key={f.branchId} className="card p-4 flex flex-col gap-3" style={{ opacity: f.active ? 1 : 0.6 }}>
            <div>
              <div className="text-strong font-semibold">{f.branchName}{!f.active && ' · closed'}</div>
              <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                {f.lastChangedAt ? `Last changed ${fmtDateTime(f.lastChangedAt)}` : 'Never changed'}
              </div>
            </div>
            <div className="stat__value">{money(f.amount, currency)}</div>
            {(!pinnedBranchId || pinnedBranchId === f.branchId) && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(f)}>Change float</button>
            )}
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
          <div className="brand" style={{ fontSize: 17 }}>Float history</div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>When</th><th>Branch</th><th className="text-right">From</th><th className="text-right">To</th><th className="text-right">Change</th><th>Reason</th><th>By</th></tr>
            </thead>
            <tbody>
              {floatHistory.length === 0 ? (
                <tr><td colSpan={7} className="text-center" style={{ color: 'var(--color-faint)', padding: 36 }}>No float changes yet.</td></tr>
              ) : (
                floatHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap text-[12.5px]" style={{ color: 'var(--color-muted)' }}>{fmtDateTime(h.createdAt)}</td>
                    <td className="text-strong">{h.branchName}</td>
                    <td className="text-right num whitespace-nowrap">{money(h.oldAmount, currency)}</td>
                    <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(h.newAmount, currency)}</td>
                    <td className="text-right num whitespace-nowrap font-semibold" style={{ color: h.delta >= 0 ? 'var(--color-ok)' : 'var(--color-brand)' }}>
                      {h.delta >= 0 ? '+' : '−'}{fmt(Math.abs(h.delta))}
                    </td>
                    <td className="text-[13px]">{h.reason}</td>
                    <td className="text-[12.5px]" style={{ color: 'var(--color-muted)' }}>{h.userName || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <FloatModal
          row={editing}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function FloatModal({ row, currency, onClose, onSaved }: { row: FloatRow; currency: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(row.amount);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const delta = amount - row.amount;

  async function save() {
    if (delta === 0) { toast('That is the same as the current float.', true); return; }
    if (reason.trim().length < 3) { toast('Give a reason for the change.', true); return; }
    setSaving(true);
    const res = await setFloatAction({ branchId: row.branchId, amount, reason });
    setSaving(false);
    if (res.ok) { toast('Float updated'); onSaved(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title={`Float — ${row.branchName}`}
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || delta === 0}>{saving ? 'Saving…' : 'Save float'}</button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
          Now <b className="num" style={{ color: 'var(--color-strong)' }}>{money(row.amount, currency)}</b>
        </div>
        <div>
          <label className="field-label">New float ({currency})</label>
          <input className="input num" inputMode="numeric" autoFocus value={String(amount)} onChange={(e) => setAmount(parseAmount(e.target.value))} />
          {delta !== 0 && (
            <div className="text-[12.5px] mt-1.5" style={{ color: delta > 0 ? 'var(--color-ok)' : 'var(--color-brand)' }}>
              {delta > 0 ? 'Increase' : 'Decrease'} of {money(Math.abs(delta), currency)}
            </div>
          )}
        </div>
        <div>
          <label className="field-label">Reason</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. More coins needed for weekend rush" />
        </div>
      </div>
    </Modal>
  );
}
