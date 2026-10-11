'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, parseAmount } from '@/lib/money';
import { fmtDate, fmtDateTime, todayStr } from '@/lib/dates';
import Modal from '../Modal';
import NameListManager from '../NameListManager';
import { toast } from '../toast';
import VoidModal from './VoidModal';
import {
  addExpenseAction,
  voidExpenseAction,
  addExpenseCategory,
  deleteExpenseCategory,
} from '@/app/finance/actions';
import type { ExpensesData, ExpenseRow } from './types';

const VIA = [
  { key: 'CASH', label: 'Cash' },
  { key: 'BANK', label: 'Bank' },
  { key: 'CARD', label: 'Card' },
];

export default function ExpensesTab({ data }: { data: ExpensesData }) {
  const router = useRouter();
  const { currency, expenses, categories } = data;
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null);
  const [cat, setCat] = useState('All');

  const usedCats = useMemo(() => ['All', ...Array.from(new Set(expenses.map((e) => e.category))).sort()], [expenses]);
  const shown = cat === 'All' ? expenses : expenses.filter((e) => e.category === cat);
  const live = expenses.filter((e) => !e.voidedAt);
  const total = live.reduce((n, e) => n + e.amount, 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
        <div className="text-[13.5px]" style={{ color: 'var(--color-muted)' }}>
          {live.length} expense{live.length === 1 ? '' : 's'} in this period ·{' '}
          <b className="num" style={{ color: 'var(--color-strong)' }}>{money(total, currency)}</b>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setManaging(true)}>Categories</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add expense</button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-3 no-print">
        {usedCats.map((c) => (
          <button key={c} className="chip" data-active={cat === c || undefined} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Details</th>
                <th>Paid by</th>
                <th>Recorded</th>
                <th className="text-right">Amount</th>
                <th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={7} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No expenses in this period.</td></tr>
              ) : (
                shown.map((e) => {
                  const v = !!e.voidedAt;
                  return (
                    <tr key={e.id} style={{ opacity: v ? 0.55 : 1 }}>
                      <td className="whitespace-nowrap text-[13px]" style={{ textDecoration: v ? 'line-through' : undefined }}>{fmtDate(e.expenseDate)}</td>
                      <td><span className="chip" style={{ cursor: 'default' }}>{e.category}</span></td>
                      <td className="text-[13px]">
                        <span style={{ textDecoration: v ? 'line-through' : undefined }}>{e.description || '—'}</span>
                        {e.branchName && <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{e.branchName}</div>}
                        {v && (
                          <div className="text-[12px]" style={{ color: 'var(--color-brand)' }}>
                            Voided {fmtDateTime(e.voidedAt!)} by {e.voidedByName ?? '—'}: {e.voidReason}
                          </div>
                        )}
                      </td>
                      <td className="text-[12.5px]">{e.paidVia}</td>
                      <td className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                        {e.userName || '—'}
                        <div>{fmtDateTime(e.createdAt)}</div>
                      </td>
                      <td className="text-right num whitespace-nowrap text-strong font-semibold" style={{ textDecoration: v ? 'line-through' : undefined }}>
                        {money(e.amount, currency)}
                      </td>
                      <td className="text-right no-print">
                        {!v && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-brand)' }} onClick={() => setVoiding(e)}>Void</button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && (
        <AddExpenseModal
          data={data}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); router.refresh(); }}
        />
      )}
      {managing && <CategoriesModal categories={categories} onClose={() => setManaging(false)} onChanged={() => router.refresh()} />}
      {voiding && (
        <VoidModal
          title="Void expense"
          subject={`${voiding.category} — ${money(voiding.amount, currency)} on ${fmtDate(voiding.expenseDate)}`}
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

function AddExpenseModal({
  data,
  onClose,
  onSaved,
}: {
  data: ExpensesData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { categories, branches, currency, pinnedBranchId, scopeBranchId } = data;
  const [category, setCategory] = useState(categories[0]?.name ?? '');
  const [amount, setAmount] = useState(0);
  const [via, setVia] = useState('CASH');
  const [date, setDate] = useState(todayStr());
  const [branchId, setBranchId] = useState<string>(pinnedBranchId ?? scopeBranchId ?? '');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!category) { toast('Pick a category (add one under Categories).', true); return; }
    if (amount <= 0) { toast('Enter the amount.', true); return; }
    setSaving(true);
    const res = await addExpenseAction({ category, amount, description, paidVia: via, date, branchId: branchId || null });
    setSaving(false);
    if (res.ok) { toast('Expense recorded'); onSaved(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title="Add expense"
      onClose={onClose}
      maxWidth={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save expense'}</button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Amount ({currency})</label>
            <input className="input num" inputMode="numeric" autoFocus value={amount ? String(amount) : ''} placeholder="0" onChange={(e) => setAmount(parseAmount(e.target.value))} />
          </div>
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
        <div>
          <label className="field-label">Paid by</label>
          <div className="flex gap-2">
            {VIA.map((v) => (
              <button key={v.key} className="chip" data-active={via === v.key || undefined} onClick={() => setVia(v.key)}>{v.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label">Details (optional)</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. October shop rent" />
        </div>
        <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
          The date is the day the expense belongs to. The exact time you enter it, and your name, are
          recorded automatically.
        </p>
      </div>
    </Modal>
  );
}

function CategoriesModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: { id: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Modal title="Expense categories" onClose={onClose} maxWidth={440} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="flex flex-col gap-3">
        <NameListManager
          items={categories.map((c) => ({ id: c.id, name: c.name }))}
          placeholder="New category, e.g. Insurance"
          emptyText="No categories yet."
          onAdd={addExpenseCategory}
          onRemove={deleteExpenseCategory}
          onChanged={onChanged}
        />
        <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
          Removing a category only takes it off this list — past expenses and reports keep it.
        </p>
      </div>
    </Modal>
  );
}
