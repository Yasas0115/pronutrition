'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money, fmt, parseAmount } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { MOVEMENT_LABELS, type MovementType } from '@/lib/stock';
import ProductModal, { type ProductRow } from './ProductModal';
import StockStepper from './StockStepper';
import PriceHistoryTable, { type PriceHistoryRow } from './PriceHistoryTable';
import Modal from './Modal';
import TransferModal from './TransferModal';
import TransfersTab from './TransfersTab';
import StockCheckModal from './StockCheckModal';
import type { TransferRow } from '@/lib/transfer-types';
import { toast } from './toast';
import { receiveStock } from '@/app/stock/actions';

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
type Tab = 'catalogue' | 'stock' | 'movements' | 'transfers' | 'prices';

// Product thumbnail + name + brand/flavor/sku line (+ per-branch chips on the
// "All branches" view). Shared by the Catalogue and Stock tables.
function ProductCell({ p, allBranches }: { p: StockProduct; allBranches: boolean }) {
  return (
    <span className="flex items-center gap-3 text-left">
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
    </span>
  );
}

export default function ProductsStockView({
  products,
  history,
  priceHistory = [],
  transfers = [],
  canSeeCost = false,
  canReconcile = false,
  storeName = 'Pro Nutrition',
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
  priceHistory?: PriceHistoryRow[];
  transfers?: TransferRow[];
  canSeeCost?: boolean;
  /** Owner / accountant: may run the stock check. */
  canReconcile?: boolean;
  storeName?: string;
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
  const [tab, setTab] = useState<Tab>('catalogue');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [receiving, setReceiving] = useState<StockProduct | null>(null);

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

  function refresh() {
    setEditing(null);
    setCreating(false);
    setTransferOpen(false);
    setReceiving(null);
    router.refresh();
  }

  const listTab = tab === 'catalogue' || tab === 'stock';

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
        <div className="flex flex-wrap gap-2">
          {canReconcile && canManageStock && (
            <button className="btn btn-ghost" onClick={() => setCheckOpen(true)} title="Compare every stock count with its history">
              ✓ Stock check
            </button>
          )}
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

      {/* KPI tiles — counts only. Stock value / prices live in Accounts. */}
      <div className="grid grid-cols-3 gap-3 mb-5">
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
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button className="chip" data-active={tab === 'catalogue' || undefined} onClick={() => setTab('catalogue')}>Catalogue</button>
        <button className="chip" data-active={tab === 'stock' || undefined} onClick={() => setTab('stock')}>Stock</button>
        {canManageStock && (
          <button className="chip" data-active={tab === 'movements' || undefined} onClick={() => setTab('movements')}>Movements</button>
        )}
        {canManageStock && isOwner && (
          <button className="chip" data-active={tab === 'transfers' || undefined} onClick={() => setTab('transfers')}>
            Transfers{transfers.length > 0 ? ` (${transfers.length})` : ''}
          </button>
        )}
        {canSeeCost && (
          <button className="chip" data-active={tab === 'prices' || undefined} onClick={() => setTab('prices')}>Price history</button>
        )}
      </div>

      {listTab && (
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

          {tab === 'catalogue' ? (
            /* CATALOGUE — product details and prices. Retail price for everyone
               who can open this page; buying price only for finance. */
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th className="text-right">Retail price</th>
                      {canSeeCost && <th className="text-right">Buying price</th>}
                      <th className="text-center">In stock</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={canSeeCost ? 6 : 5} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No products found.</td></tr>
                    ) : (
                      filtered.map((p) => {
                        const out = p.stock <= 0;
                        const low = !out && p.stock <= p.lowStockAt;
                        const color = out ? 'var(--color-brand)' : low ? 'var(--color-warn)' : 'var(--color-strong)';
                        return (
                          <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                            <td>
                              <button className="text-left" onClick={() => canEditProducts && setEditing(p)} disabled={!canEditProducts}>
                                <ProductCell p={p} allBranches={allBranches} />
                              </button>
                            </td>
                            <td><span className="chip" style={{ cursor: 'default' }}>{p.category}</span></td>
                            <td className="text-right num text-strong font-semibold">{money(p.price, currency)}</td>
                            {canSeeCost && (
                              <td className="text-right num" style={{ color: 'var(--color-muted)' }}>
                                {p.cost > 0 ? money(p.cost, currency) : <span style={{ color: 'var(--color-faint)' }}>not set</span>}
                              </td>
                            )}
                            <td className="text-center num font-semibold" style={{ color }} title={allBranches ? 'Total across branches' : undefined}>{fmt(p.stock)}</td>
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
          ) : (
            /* STOCK — quantities only. No price, no value, by design. */
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th className="text-center">Stock</th>
                      <th className="text-center">Low at</th>
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
                            <td><ProductCell p={p} allBranches={allBranches} /></td>
                            <td><span className="chip" style={{ cursor: 'default' }}>{p.category}</span></td>
                            <td>
                              {stockEditable ? (
                                <StockStepper id={p.id} value={p.stock} lowStockAt={p.lowStockAt} />
                              ) : (
                                <div className="text-center num font-semibold" style={{ color }} title={allBranches ? 'Total across branches' : undefined}>{fmt(p.stock)}</div>
                              )}
                            </td>
                            <td className="text-center num" style={{ color: 'var(--color-muted)' }}>{allBranches ? '—' : fmt(p.lowStockAt)}</td>
                            <td className="text-right">
                              {stockEditable && (
                                <button className="btn btn-ghost btn-sm" onClick={() => setReceiving(p)}>+ Receive</button>
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
          )}
        </>
      )}

      {tab === 'movements' && canManageStock && (
        <HistoryTable history={history} currency={currency} allBranches={allBranches} />
      )}

      {tab === 'transfers' && canManageStock && isOwner && (
        <TransfersTab transfers={transfers} storeName={storeName} />
      )}

      {tab === 'prices' && canSeeCost && <PriceHistoryTable rows={priceHistory} currency={currency} />}

      {(creating || editing) && (
        <ProductModal
          product={editing}
          categories={categories.filter((c) => c !== 'All')}
          branchLabel={activeBranchName}
          stockEditable={stockEditable}
          canSeeCost={canSeeCost}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={refresh}
        />
      )}

      {receiving && (
        <ReceiveModal
          product={receiving}
          branchId={activeScope}
          branchName={activeBranchName}
          canSeeCost={canSeeCost}
          currency={currency}
          onClose={() => setReceiving(null)}
          onDone={refresh}
        />
      )}

      {transferOpen && (
        <TransferModal
          products={products}
          branches={activeBranches}
          fromDefault={allBranches ? '' : activeScope}
          onClose={() => setTransferOpen(false)}
          onDone={refresh}
        />
      )}

      {checkOpen && <StockCheckModal onClose={() => setCheckOpen(false)} />}
    </>
  );
}

// Receive a supplier delivery into the active branch. The buying price field is
// only offered to finance users; everyone else just records the quantity.
function ReceiveModal({
  product, branchId, branchName, canSeeCost, currency, onClose, onDone,
}: {
  product: StockProduct;
  branchId: string;
  branchName: string;
  canSeeCost: boolean;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState(product.cost > 0 ? String(product.cost) : '');
  const [note, setNote] = useState('');

  const q = parseAmount(qty);
  const cost = parseAmount(unitCost);

  function submit() {
    if (q <= 0) { toast('Enter the quantity received.', true); return; }
    start(async () => {
      const res = await receiveStock({
        productId: product.id,
        branchId,
        qty: q,
        unitCost: canSeeCost && cost > 0 ? cost : undefined,
        note,
      });
      if (res.ok) { toast(`Received ${q} × ${product.name}`); onDone(); }
      else toast(res.error, true);
    });
  }

  return (
    <Modal
      title="Receive stock"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>{pending ? 'Saving…' : 'Receive'}</button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-strong font-semibold">{product.name}</div>
          <div className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
            {branchName} · on hand now <b className="num" style={{ color: 'var(--color-strong)' }}>{fmt(product.stock)}</b>
            {q > 0 && <> → <b className="num" style={{ color: 'var(--color-strong)' }}>{fmt(product.stock + q)}</b></>}
          </div>
        </div>
        <label className="block">
          <span className="field-label">Quantity received</span>
          <input className="input num" inputMode="numeric" autoFocus value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
        </label>
        {canSeeCost && (
          <label className="block">
            <span className="field-label">Buying price per unit ({currency})</span>
            <input className="input num" inputMode="numeric" value={unitCost} onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
            <span className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
              If this differs from the current buying price, the product&apos;s buying price is updated and the change is logged in Price history.
            </span>
          </label>
        )}
        <label className="block">
          <span className="field-label">Note (optional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Supplier invoice no." />
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
