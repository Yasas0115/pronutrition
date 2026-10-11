'use client';

import { useState, useTransition } from 'react';
import { fmt, parseAmount } from '@/lib/money';
import Modal from './Modal';
import { toast } from './toast';
import { transferStockBatch } from '@/app/stock/actions';

export type TransferProduct = {
  id: string;
  name: string;
  active: boolean;
  /** On-hand per branch (all branches, regardless of the scope being viewed). */
  perBranch: { branchId: string; stock: number }[];
};

type BranchOpt = { id: string; name: string };
type Line = { key: number; productId: string; qty: string };

let nextKey = 1;

// One document, many products. Both branches' balances are shown as you build
// it, so you can see what each side will hold afterwards before saving.
export default function TransferModal({
  products,
  branches,
  fromDefault,
  onClose,
  onDone,
}: {
  products: TransferProduct[];
  branches: BranchOpt[];
  fromDefault: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(fromDefault || branches[0]?.id || '');
  const [to, setTo] = useState(branches.find((b) => b.id !== (fromDefault || branches[0]?.id))?.id ?? '');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, productId: products[0]?.id ?? '', qty: '' }]);

  const pool = products.filter((p) => p.active);
  const stockAt = (productId: string, branchId: string) =>
    products.find((p) => p.id === productId)?.perBranch.find((b) => b.branchId === branchId)?.stock ?? 0;

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Same product on two rows is added together, exactly as the server does.
  const wanted = new Map<string, number>();
  for (const l of lines) {
    const q = parseAmount(l.qty);
    if (l.productId && q > 0) wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + q);
  }
  const over = Array.from(wanted).filter(([id, q]) => q > stockAt(id, from));

  function submit() {
    if (!from || !to) { toast('Pick both branches.', true); return; }
    if (from === to) { toast('Source and destination must differ.', true); return; }
    if (wanted.size === 0) { toast('Add at least one product with a quantity.', true); return; }
    if (over.length > 0) {
      const p = products.find((x) => x.id === over[0][0]);
      toast(`Not enough ${p?.name ?? 'stock'} at the sending branch.`, true);
      return;
    }
    start(async () => {
      const res = await transferStockBatch({
        fromBranchId: from,
        toBranchId: to,
        note,
        items: Array.from(wanted, ([productId, qty]) => ({ productId, qty })),
      });
      if (res.ok) { toast(`Transfer TRF-${res.number} saved.`); onDone(); }
      else toast(res.error, true);
    });
  }

  return (
    <Modal
      title="Transfer stock"
      onClose={onClose}
      maxWidth={620}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || wanted.size === 0}>
            {pending ? 'Moving…' : `Transfer ${wanted.size > 0 ? `${wanted.size} product${wanted.size === 1 ? '' : 's'}` : ''}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">From</span>
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label">To</span>
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="" disabled>Select a branch…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid gap-2 text-[11px] uppercase tracking-wider px-1" style={{ gridTemplateColumns: '1fr 92px 120px 32px', color: 'var(--color-faint)' }}>
            <span>Product</span><span className="text-right">Qty</span><span className="text-right">Sender → Receiver</span><span />
          </div>
          {lines.map((l) => {
            const q = parseAmount(l.qty);
            const sender = stockAt(l.productId, from);
            const receiver = stockAt(l.productId, to);
            const tooMany = (wanted.get(l.productId) ?? 0) > sender;
            return (
              <div key={l.key} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 92px 120px 32px' }}>
                <select className="input" value={l.productId} onChange={(e) => setLine(l.key, { productId: e.target.value })}>
                  {pool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input
                  className="input num text-right"
                  inputMode="numeric"
                  placeholder="0"
                  value={l.qty}
                  onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                  style={tooMany ? { borderColor: 'var(--color-brand)' } : undefined}
                />
                <div className="text-right text-[12px] num whitespace-nowrap" style={{ color: tooMany ? 'var(--color-brand)' : 'var(--color-muted)' }}>
                  {fmt(sender)}{q > 0 && <> → <b style={{ color: 'var(--color-strong)' }}>{fmt(sender - q)}</b></>}
                  <br />
                  {fmt(receiver)}{q > 0 && <> → <b style={{ color: 'var(--color-strong)' }}>{fmt(receiver + q)}</b></>}
                </div>
                <button
                  className="text-[20px] leading-none"
                  style={{ color: 'var(--color-faint)' }}
                  aria-label="Remove line"
                  onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== l.key) : prev))}
                  disabled={lines.length === 1}
                >
                  ×
                </button>
              </div>
            );
          })}
          <div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setLines((prev) => [...prev, { key: nextKey++, productId: pool[0]?.id ?? '', qty: '' }])}
            >
              + Add product
            </button>
          </div>
        </div>

        {over.length > 0 && (
          <p className="text-[12.5px]" style={{ color: 'var(--color-brand)' }}>
            More than the sending branch holds for: {over.map(([id]) => products.find((p) => p.id === id)?.name).join(', ')}.
          </p>
        )}

        <label className="block">
          <span className="field-label">Note (optional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Weekly top-up for Kandy" />
        </label>

        <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
          One document, saved all-or-nothing: the sender goes down and the receiver goes up by exactly the same
          quantities, and both balances are written to the stock history.
        </p>
      </div>
    </Modal>
  );
}
