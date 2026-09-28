'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money, fmt, parseAmount } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { MOVEMENT_LABELS, type MovementType } from '@/lib/stock';
import ProductModal, { type ProductRow } from './ProductModal';
import StockStepper from './StockStepper';
import Modal from './Modal';
import { toast } from './toast';
import { transferStock } from '@/app/stock/actions';

export type PerBranch = { branchId: string; branchName: string; stock: number; lowStockAt: number };

export type StockProduct = ProductRow & { perBranch: PerBranch[] };

export type MovementRow = {
  id: string;
  productName: string;
  branchName: string;
  type: string;
  delta: number;
  balanceAfter: number;
  unitCost: number | null;
  note: string | null;
  userName: string | null;
  createdAt: string;
};

type BranchOpt = { id: string; name: string; active: boolean };
type StockFilter = 'all' | 'low' | 'out';

export default function ProductsStockView({
  products,
  history,
  currency,
  categories: catList = [],
  branches,
  activeScope,
  activeBranchName,
  allBranches,
  isOwner,
  canEditProducts,
  canManageStock,
}: {
  products: StockProduct[];
  history: MovementRow[];
  currency: string;
  categories?: string[];
  branches: BranchOpt[];
  activeScope: string;
  activeBranchName: string;
  allBranches: boolean;
  isOwner: boolean;
  canEditProducts: boolean;
  canManageStock: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'catalogue' | 'movements'>('catalogue');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const activeBranches = branches.filter((b) => b.active);
  const stockEditable = canManageStock && !allBranches;

  const categories = useMemo(
    () => [
      'All',
      ...Array.from(new Set([...catList, ...products.map((p) => p.category)])).filter(Boolean).sort(),
    ],
    [catList, products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'All' && p.category !== cat) return false;
      if (stockFilter === 'low' && !(p.stock > 0 && p.stock <= p.lowStockAt)) return false;
      if (stockFilter === 'out' && p.stock > 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, query, cat, stockFilter]);

  const active = products.filter((p) => p.active);
  const lowCount = active.filter((p) => p.stock > 0 && p.stock <= p.lowStockAt).length;
  const outCount = active.filter((p) => p.stock <= 0).length;
  const retailValue = active.reduce((s, p) => s + p.price * p.stock, 0);

  function refresh() {
    setEditing(null);
    setCreating(false);
    setTransferOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="page-title">Products &amp; Stock</h1>
          <p className="page-sub">
            Shared catalogue · stock for <b style={{ color: 'var(--color-strong)' }}>{activeBranchName}</b>
            {allBranches && canManageStock && ' · pick a single branch to receive or count'}
          </p>
        </div>
        <div className="flex gap-2">
          {canManageStock && isOwner && activeBranches.length >= 2 && (
            <button className="btn btn-ghost" onClick={() => setTransferOpen(true)} disabled={products.length === 0}>
              ⇄ Transfer
            </button>
          )}
          {canEditProducts && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Add product</button>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Active products</div>
          <div className="stat__value">{active.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Low stock</div>
          <div className="stat__value" style={{ color: lowCount ? 'var(--color-warn)' : undefined }}>{lowCount}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Out of stock</div>
          <div className="stat__value" style={{ color: outCount ? 'var(--color-brand)' : undefined }}>{outCount}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Stock value (retail)</div>
          <div className="stat__value accent">{money(retailValue, currency)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button className="chip" data-active={tab === 'catalogue' || undefined} onClick={() => setTab('catalogue')}>Catalogue</button>
        {canManageStock && (
          <button className="chip" data-active={tab === 'movements' || undefined} onClick={() => setTab('movements')}>Movements</button>
        )}
      </div>

      {tab === 'catalogue' ? (
        <>
          <div className="mb-4">
            <input
              className="input"
              placeholder="Search products, brand, barcode…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex gap-2 overflow-x-auto mt-3 pb-1">
              {categories.map((c) => (
                <button key={c} className="chip" data-active={cat === c || undefined} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button className="chip" data-active={stockFilter === 'all' || undefined} onClick={() => setStockFilter('all')}>All stock</button>
              <button className="chip" data-active={stockFilter === 'low' || undefined} onClick={() => setStockFilter('low')}>Low ({lowCount})</button>
              <button className="chip" data-active={stockFilter === 'out' || undefined} onClick={() => setStockFilter('out')}>Out ({outCount})</button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="text-right">Price</th>
                    <th className="text-center">Stock</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No products found.</td></tr>
                  ) : (
                    filtered.map((p) => {
                      const out = p.stock <= 0;
                      const low = !out && p.stock <= p.lowStockAt;
                      const color = out ? 'var(--color-brand)' : low ? 'var(--color-warn)' : 'var(--color-strong)';
                      return (
                        <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                          <td>
                            <button className="text-left flex items-center gap-3" onClick={() => canEditProducts && setEditing(p)} disabled={!canEditProducts}>
                              <span className="relative grid place-items-center rounded-lg shrink-0 overflow-hidden" style={{ width: 40, height: 40, background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}>
                                {p.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ fontSize: 11, color: 'var(--color-faint)' }}>{p.name[0]?.toUpperCase() ?? '?'}</span>
                                )}
                                {p.images.length > 1 && (
                                  <span className="absolute bottom-0 right-0 num" style={{ fontSize: 9, lineHeight: 1, padding: '1px 3px', color: '#fff', background: 'var(--color-brand)', borderTopLeftRadius: 4 }}>+{p.images.length - 1}</span>
                                )}
                              </span>
                              <span>
                                <span className="block text-strong font-semibold">{p.name}</span>
                                <span className="block text-[12px]" style={{ color: 'var(--color-muted)' }}>
                                  {[p.brand, p.flavor, p.sku].filter(Boolean).join(' · ') || '—'}
                                  {!p.active && ' · inactive'}
                                </span>
                                {allBranches && p.perBranch.length > 0 && (
                                  <span className="flex flex-wrap gap-1 mt-1">
                                    {p.perBranch.map((b) => (
                                      <span key={b.branchId} className="chip" style={{ cursor: 'default', fontSize: 10, padding: '1px 7px' }} title={b.branchName}>
                                        {b.branchName}: <b style={{ color: b.stock <= 0 ? 'var(--color-brand)' : b.stock <= b.lowStockAt ? 'var(--color-warn)' : 'var(--color-strong)' }}>{b.stock}</b>
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </span>
                            </button>
                          </td>
                          <td><span className="chip" style={{ cursor: 'default' }}>{p.category}</span></td>
                          <td className="text-right num text-strong font-semibold">{money(p.price, currency)}</td>
                          <td>
                            {stockEditable ? (
                              <StockStepper id={p.id} value={p.stock} lowStockAt={p.lowStockAt} />
                            ) : (
                              <div className="text-center num font-semibold" style={{ color }} title={allBranches ? 'Total across branches' : undefined}>{fmt(p.stock)}</div>
                            )}
                          </td>
                          <td className="text-right">
                            {canEditProducts && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <HistoryTable history={history} currency={currency} allBranches={allBranches} />
      )}

      {(creating || editing) && (
        <ProductModal
          product={editing}
          categories={categories.filter((c) => c !== 'All')}
          branchLabel={activeBranchName}
          stockEditable={stockEditable}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={refresh}
        />
      )}

      {transferOpen && (
        <TransferModal
          rows={products}
          branches={activeBranches}
          fromDefault={allBranches ? '' : activeScope}
          onClose={() => setTransferOpen(false)}
          onDone={refresh}
        />
      )}
    </>
  );
}

function BranchPicker({ branches, value, onChange, label = 'Branch' }: { branches: BranchOpt[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Select a branch…</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  );
}

function TransferModal({
  rows, branches, fromDefault, onClose, onDone,
}: {
  rows: StockProduct[];
  branches: BranchOpt[];
  fromDefault: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState(rows[0]?.id ?? '');
  const [from, setFrom] = useState(fromDefault || branches[0]?.id || '');
  const [to, setTo] = useState(branches.find((b) => b.id !== (fromDefault || branches[0]?.id))?.id ?? '');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  const row = rows.find((r) => r.id === productId) ?? rows[0];
  const onHandFrom = row?.perBranch.find((b) => b.branchId === from)?.stock
    ?? (from && (row?.perBranch.length ?? 0) === 0 ? row?.stock ?? 0 : 0);

  function submit() {
    const q = parseAmount(qty);
    if (!from || !to) { toast('Pick both branches.', true); return; }
    if (from === to) { toast('Source and destination must differ.', true); return; }
    if (q <= 0) { toast('Enter a quantity.', true); return; }
    start(async () => {
      const res = await transferStock({ productId, fromBranchId: from, toBranchId: to, qty: q, note });
      if (res.ok) { toast('Transfer saved.'); onDone(); }
      else toast(res.error, true);
    });
  }

  return (
    <Modal
      title="Transfer stock"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>{pending ? 'Moving…' : 'Transfer'}</button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="field-label">Product</span>
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <BranchPicker branches={branches} value={from} onChange={setFrom} label="From" />
          <BranchPicker branches={branches} value={to} onChange={setTo} label="To" />
        </div>
        <div className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
          Available to send: <b className="num" style={{ color: 'var(--color-strong)' }}>{fmt(onHandFrom)}</b>
        </div>
        <label className="block">
          <span className="field-label">Quantity</span>
          <input className="input num" inputMode="numeric" autoFocus value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
        </label>
        <label className="block">
          <span className="field-label">Note (optional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rebalancing stock" />
        </label>
      </div>
    </Modal>
  );
}

const TYPE_TONE: Record<string, string> = {
  RESTOCK: 'var(--color-strong)',
  TRANSFER_IN: 'var(--color-strong)',
  INITIAL: 'var(--color-muted)',
  COUNT: 'var(--color-muted)',
  SALE: 'var(--color-brand)',
  TRANSFER_OUT: 'var(--color-brand)',
  ADJUST: 'var(--color-warn)',
};

function HistoryTable({ history, currency, allBranches }: { history: MovementRow[]; currency: string; allBranches: boolean }) {
  const [type, setType] = useState<'all' | MovementType>('all');
  const types = Object.keys(MOVEMENT_LABELS) as MovementType[];
  const shown = type === 'all' ? history : history.filter((m) => m.type === type);

  return (
    <>
      <div className="flex gap-2 flex-wrap mb-4">
        <button className="chip" data-active={type === 'all' || undefined} onClick={() => setType('all')}>All</button>
        {types.map((t) => (
          <button key={t} className="chip" data-active={type === t || undefined} onClick={() => setType(t)}>{MOVEMENT_LABELS[t]}</button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                {allBranches && <th>Branch</th>}
                <th>Type</th>
                <th className="text-center">Change</th>
                <th className="text-center">Balance</th>
                <th>Note</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={allBranches ? 8 : 7} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No movements yet.</td></tr>
              ) : (
                shown.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap" style={{ color: 'var(--color-muted)', fontSize: 12 }}>{fmtDateTime(m.createdAt)}</td>
                    <td className="text-strong">{m.productName}</td>
                    {allBranches && <td style={{ color: 'var(--color-muted)' }}>{m.branchName}</td>}
                    <td><span className="chip" style={{ cursor: 'default', color: TYPE_TONE[m.type] }}>{MOVEMENT_LABELS[m.type as MovementType] ?? m.type}</span></td>
                    <td className="text-center num font-semibold" style={{ color: m.delta >= 0 ? 'var(--color-strong)' : 'var(--color-brand)' }}>{m.delta >= 0 ? `+${fmt(m.delta)}` : fmt(m.delta)}</td>
                    <td className="text-center num">{fmt(m.balanceAfter)}</td>
                    <td style={{ color: 'var(--color-muted)', fontSize: 12 }}>
                      {m.note || '—'}
                      {m.unitCost != null && <span className="block" style={{ color: 'var(--color-faint)' }}>@ {money(m.unitCost, currency)}</span>}
                    </td>
                    <td style={{ color: 'var(--color-muted)', fontSize: 12 }}>{m.userName || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
