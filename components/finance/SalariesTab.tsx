'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, parseAmount } from '@/lib/money';
import { fmtDate, fmtDateTime, todayStr } from '@/lib/dates';
import Modal from '../Modal';
import { toast } from '../toast';
import VoidModal from './VoidModal';
import { saveWorker, setWorkerActive, paySalaryAction, voidSalaryAction } from '@/app/finance/actions';
import type { ExpensesData, WorkerRow, SalaryRow } from './types';

const VIA = [
  { key: 'CASH', label: 'Cash' },
  { key: 'BANK', label: 'Bank' },
  { key: 'CARD', label: 'Card' },
];

export default function SalariesTab({
  data,
  onMonthChange,
}: {
  data: ExpensesData;
  onMonthChange: (m: string) => void;
}) {
  const router = useRouter();
  const { currency, workers, salaries, month, monthOptions } = data;
  const [editing, setEditing] = useState<WorkerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<WorkerRow | null>(null);
  const [voiding, setVoiding] = useState<SalaryRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const shownWorkers = workers.filter((w) => w.active || showInactive || w.paidNet > 0);
  const live = salaries.filter((s) => !s.voidedAt);
  const totalNet = live.reduce((n, s) => n + s.netPaid, 0);
  const totalDue = workers.filter((w) => w.active).reduce((n, w) => n + Math.max(0, w.monthlySalary - w.paidBase), 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 no-print">
        <div>
          <label className="field-label">Salary month</label>
          <select className="input" style={{ width: 220 }} value={month} onChange={(e) => onMonthChange(e.target.value)}>
            {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Add worker</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Paid this month</div>
          <div className="stat__value">{money(totalNet, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{live.length} payment{live.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Still to pay</div>
          <div className="stat__value" style={{ color: totalDue ? 'var(--color-warn)' : undefined }}>{money(totalDue, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>of the monthly salaries</div>
        </div>
      </div>

      <div className="card overflow-hidden mb-5">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Worker</th>
                <th className="text-right">Monthly salary</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Left to pay</th>
                <th>Status</th>
                <th className="text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shownWorkers.length === 0 ? (
                <tr><td colSpan={6} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No workers yet — add the first one.</td></tr>
              ) : (
                shownWorkers.map((w) => {
                  const left = Math.max(0, w.monthlySalary - w.paidBase);
                  const status = w.monthlySalary <= 0 ? 'No salary set' : left === 0 ? 'Paid' : w.paidBase > 0 ? 'Part paid' : 'Not paid';
                  const tone = status === 'Paid' ? 'var(--color-ok)' : status === 'Part paid' ? 'var(--color-warn)' : status === 'Not paid' ? 'var(--color-brand)' : 'var(--color-faint)';
                  return (
                    <tr key={w.id} style={{ opacity: w.active ? 1 : 0.55 }}>
                      <td>
                        <div className="text-strong font-semibold">{w.name}</div>
                        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                          {[w.title, w.branchName, w.phone].filter(Boolean).join(' · ') || '—'}{!w.active && ' · left'}
                        </div>
                      </td>
                      <td className="text-right num whitespace-nowrap">{money(w.monthlySalary, currency)}</td>
                      <td className="text-right num whitespace-nowrap">
                        {money(w.paidNet, currency)}
                        {(w.paidBonus > 0 || w.paidDeduction > 0) && (
                          <div className="text-[11px]" style={{ color: 'var(--color-faint)' }}>
                            {w.paidBonus > 0 && `+${w.paidBonus.toLocaleString('en-LK')} bonus `}
                            {w.paidDeduction > 0 && `−${w.paidDeduction.toLocaleString('en-LK')} deducted`}
                          </div>
                        )}
                      </td>
                      <td className="text-right num whitespace-nowrap">{money(left, currency)}</td>
                      <td><span className="badge" style={{ color: tone, background: 'var(--color-ink-1)' }}>{status}</span></td>
                      <td className="text-right whitespace-nowrap no-print">
                        {w.active && <button className="btn btn-ghost btn-sm" onClick={() => setPaying(w)}>Pay</button>}
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(w)}>Edit</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <label className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none text-[13px] no-print" style={{ color: 'var(--color-ash)', borderTop: '1px solid var(--color-line)' }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--color-brand)' }} />
          Show workers who have left
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)' }}>
          <div className="brand" style={{ fontSize: 17 }}>Payments for this month</div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Paid on</th><th>Worker</th><th className="text-right">Salary</th><th className="text-right">Bonus</th>
                <th className="text-right">Deducted</th><th className="text-right">Paid out</th><th>Recorded</th><th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {salaries.length === 0 ? (
                <tr><td colSpan={8} className="text-center" style={{ color: 'var(--color-faint)', padding: 32 }}>No salary payments recorded for this month.</td></tr>
              ) : (
                salaries.map((s) => {
                  const v = !!s.voidedAt;
                  const strike = v ? 'line-through' : undefined;
                  return (
                    <tr key={s.id} style={{ opacity: v ? 0.55 : 1 }}>
                      <td className="whitespace-nowrap text-[13px]" style={{ textDecoration: strike }}>{fmtDate(s.paidAt)}</td>
                      <td>
                        <span className="text-strong font-semibold" style={{ textDecoration: strike }}>{s.workerName}</span>
                        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{s.paidVia}{s.note ? ` · ${s.note}` : ''}</div>
                        {v && <div className="text-[12px]" style={{ color: 'var(--color-brand)' }}>Voided {fmtDateTime(s.voidedAt!)}: {s.voidReason}</div>}
                      </td>
                      <td className="text-right num whitespace-nowrap" style={{ textDecoration: strike }}>{money(s.baseAmount, currency)}</td>
                      <td className="text-right num whitespace-nowrap" style={{ textDecoration: strike }}>{s.bonus ? money(s.bonus, currency) : '—'}</td>
                      <td className="text-right num whitespace-nowrap" style={{ textDecoration: strike }}>{s.deduction ? money(s.deduction, currency) : '—'}</td>
                      <td className="text-right num whitespace-nowrap text-strong font-semibold" style={{ textDecoration: strike }}>{money(s.netPaid, currency)}</td>
                      <td className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                        {s.userName || '—'}<div>{fmtDateTime(s.createdAt)}</div>
                      </td>
                      <td className="text-right no-print">
                        {!v && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-brand)' }} onClick={() => setVoiding(s)}>Void</button>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <WorkerModal
          worker={editing}
          data={data}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); router.refresh(); }}
        />
      )}
      {paying && (
        <PaySalaryModal
          worker={paying}
          data={data}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); router.refresh(); }}
        />
      )}
      {voiding && (
        <VoidModal
          title="Void salary payment"
          subject={`${voiding.workerName} — ${money(voiding.netPaid, currency)} for ${voiding.period}`}
          onClose={() => setVoiding(null)}
          onConfirm={async (reason) => {
            const res = await voidSalaryAction(voiding.id, reason);
            if (res.ok) router.refresh();
            return res;
          }}
        />
      )}
    </>
  );
}

function WorkerModal({
  worker, data, onClose, onSaved,
}: {
  worker: WorkerRow | null;
  data: ExpensesData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!worker;
  const { branches, currency, pinnedBranchId } = data;
  const [name, setName] = useState(worker?.name ?? '');
  const [title, setTitle] = useState(worker?.title ?? '');
  const [phone, setPhone] = useState(worker?.phone ?? '');
  const [salary, setSalary] = useState(worker?.monthlySalary ?? 0);
  const [branchId, setBranchId] = useState(worker?.branchId ?? pinnedBranchId ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast('Enter the worker’s name.', true); return; }
    setSaving(true);
    const res = await saveWorker({ id: worker?.id, name, title, phone, monthlySalary: salary, branchId: branchId || null });
    setSaving(false);
    if (res.ok) { toast(editing ? 'Worker updated' : 'Worker added'); onSaved(); }
    else toast(res.error, true);
  }

  async function toggle() {
    if (!worker) return;
    setSaving(true);
    const res = await setWorkerActive(worker.id, !worker.active);
    setSaving(false);
    if (res.ok) { toast(worker.active ? 'Marked as left' : 'Re-activated'); onSaved(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title={editing ? 'Edit worker' : 'Add worker'}
      onClose={onClose}
      maxWidth={480}
      footer={
        <>
          {editing && (
            <button className="btn btn-ghost mr-auto" onClick={toggle} disabled={saving}>
              {worker!.active ? 'Mark as left' : 'Re-activate'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add worker'}</button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Name</label>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Role</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sales assistant" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Monthly salary ({currency})</label>
            <input className="input num" inputMode="numeric" value={salary ? String(salary) : ''} placeholder="0" onChange={(e) => setSalary(parseAmount(e.target.value))} />
          </div>
          <div>
            <label className="field-label">Phone</label>
            <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="field-label">Works at</label>
          <select className="input" value={branchId} disabled={!!pinnedBranchId} onChange={(e) => setBranchId(e.target.value)}>
            {!pinnedBranchId && <option value="">Not tied to one branch</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
          Workers are separate from staff logins — they don&apos;t need an account in the POS.
        </p>
      </div>
    </Modal>
  );
}

function PaySalaryModal({
  worker, data, onClose, onSaved,
}: {
  worker: WorkerRow;
  data: ExpensesData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currency, month } = data;
  const remaining = Math.max(0, worker.monthlySalary - worker.paidBase);
  const [base, setBase] = useState(remaining);
  const [bonus, setBonus] = useState(0);
  const [deduction, setDeduction] = useState(0);
  const [via, setVia] = useState('CASH');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const net = base + bonus - deduction;

  async function save() {
    if (net <= 0) { toast('The amount paid out must be more than zero.', true); return; }
    setSaving(true);
    const res = await paySalaryAction({ workerId: worker.id, period: month, base, bonus, deduction, paidVia: via, date, note });
    setSaving(false);
    if (res.ok) { toast(`Salary recorded — ${money(net, currency)} to ${worker.name}`); onSaved(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title="Pay salary"
      onClose={onClose}
      maxWidth={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || net <= 0}>{saving ? 'Saving…' : `Pay ${net > 0 ? money(net, currency) : ''}`}</button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-strong font-semibold">{worker.name}</div>
          <div className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
            Salary for {data.monthOptions.find((m) => m.value === month)?.label ?? month} ·{' '}
            monthly {money(worker.monthlySalary, currency)} · left to pay <b className="num" style={{ color: 'var(--color-strong)' }}>{money(remaining, currency)}</b>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">Salary</label>
            <input className="input num" inputMode="numeric" autoFocus value={base ? String(base) : ''} placeholder="0" onChange={(e) => setBase(parseAmount(e.target.value))} />
          </div>
          <div>
            <label className="field-label">Bonus</label>
            <input className="input num" inputMode="numeric" value={bonus ? String(bonus) : ''} placeholder="0" onChange={(e) => setBonus(parseAmount(e.target.value))} />
          </div>
          <div>
            <label className="field-label">Deduction</label>
            <input className="input num" inputMode="numeric" value={deduction ? String(deduction) : ''} placeholder="0" onChange={(e) => setDeduction(parseAmount(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Paid on</label>
            <input className="input" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Paid by</label>
            <div className="flex gap-2 mt-1">
              {VIA.map((v) => (
                <button key={v.key} className="chip" data-active={via === v.key || undefined} onClick={() => setVia(v.key)}>{v.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="field-label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 days unpaid leave deducted" />
        </div>
        <div className="summary-row">
          <span>Paid out</span>
          <span className="num" style={{ color: net > 0 ? 'var(--color-strong)' : 'var(--color-brand)' }}>{money(Math.max(0, net), currency)}</span>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
          The amount paid out is recorded as an expense on the day above and reduces profit.
        </p>
      </div>
    </Modal>
  );
}
