'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money, fmt, parseAmount } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { MOVEMENT_LABELS, type MovementType } from '@/lib/stock';
import ProductModal, { type ProductRow } from './ProductModal';
import StockStepper from './StockStepper';
import Modal from './Modal';
import TransferModal from './TransferModal';
import TransfersTab from './TransfersTab';
import StockCheckModal from './StockCheckModal';
import type { TransferRow } from '@/lib/transfer-types';
import { toast } from './toast';
import { receiveStock, writeOffStock } from '@/app/stock/actions';
import { useT } from '@/components/I18nProvider';

export type PerBranch = { branchId: string; branchName: string; stock: number; lowStockAt: number };

export type StockProduct = ProductRow & { perBranch: PerBranch[] };

export type MovementRow = {
  id: string;
  productName: string;
  branchName: string;
  type: string;
  delta: number;
  balanceAfter: number;
  note: string | null;
  userName: string | null;
  createdAt: string;
};

type BranchOpt = { id: string; name: string; active: boolean };
type StockFilter = 'all' | 'low' | 'out';
type Tab = 'catalogue' | 'stock' | 'movements' | 'transfers';

// Product thumbnail + name + brand/flavor/sku line (+ per-branch chips on the
// "All branches" view). Shared by the Catalogue and Stock tables.
function ProductCell({ p, allBranches }: { p: StockProduct; allBranches: boolean }) {
  const tx = useT();
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
          {!p.active && tx(" · inactive")}
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
  allBranchAccess,
  canEditProducts,
  canManageStock,
}: {
  products: StockProduct[];
  history: MovementRow[];
  transfers?: TransferRow[];
  /** Owner / accountant: the buying-price input boxes are offered (never shown as figures here). */
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
  allBranchAccess: boolean;
  canEditProducts: boolean;
  canManageStock: boolean;
}) {
  const tx = useT();
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
  const [writingOff, setWritingOff] = useState<string | null>(null);

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
          <h1 className="page-title">{tx("Products & Stock")}</h1>
          <p className="page-sub">
            {tx("Shared catalogue · stock for")}{' '}<b style={{ color: 'var(--color-strong)' }}>{activeBranchName}</b>
            {allBranches && canManageStock && tx(" · pick a single branch to count or write off (Receive works here too)")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReconcile && canManageStock && (
            <button className="btn btn-ghost" onClick={() => setCheckOpen(true)} title={tx("Compare every stock count with its history")}>
              {tx("✓ Stock check")}
            </button>
          )}
          {canManageStock && allBranchAccess && activeBranches.length >= 2 && (
            <button className="btn btn-ghost" onClick={() => setTransferOpen(true)} disabled={products.length === 0}>
              {tx("⇄ Transfer")}
            </button>
          )}
          {canEditProducts && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>{tx("+ Add product")}</button>
          )}
        </div>
      </div>

      {/* KPI tiles — counts only. Stock value, buying prices and price history
          live in Accounting › Stock value. */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">{tx("Active products")}</div>
          <div className="stat__value">{active.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">{tx("Low stock")}</div>
          <div className="stat__value" style={{ color: lowCount ? 'var(--color-warn)' : undefined }}>{lowCount}</div>
        </div>
        <div className="stat">
          <div className="stat__label">{tx("Out of stock")}</div>
          <div className="stat__value" style={{ color: outCount ? 'var(--color-brand)' : undefined }}>{outCount}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button className="chip" data-active={tab === 'catalogue' || undefined} onClick={() => setTab('catalogue')}>{tx("Catalogue")}</button>
        <button className="chip" data-active={tab === 'stock' || undefined} onClick={() => setTab('stock')}>{tx("Stock")}</button>
        {canManageStock && (
          <button className="chip" data-active={tab === 'movements' || undefined} onClick={() => setTab('movements')}>{tx("Movements")}</button>
        )}
        {canManageStock && allBranchAccess && (
          <button className="chip" data-active={tab === 'transfers' || undefined} onClick={() => setTab('transfers')}>
            {tx("Transfers")}{transfers.length > 0 ? ` (${transfers.length})` : ''}
          </button>
        )}
      </div>

      {listTab && (
        <>
          <div className="mb-4">
            <input
              className="input"
              placeholder={tx("Search products, brand, barcode…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex gap-2 overflow-x-auto mt-3 pb-1">
              {categories.map((c) => (
                <button key={c} className="chip" data-active={cat === c || undefined} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button className="chip" data-active={stockFilter === 'all' || undefined} onClick={() => setStockFilter('all')}>{tx("All stock")}</button>
              <button className="chip" data-active={stockFilter === 'low' || undefined} onClick={() => setStockFilter('low')}>{tx("Low ({0})", [lowCount])}</button>
              <button className="chip" data-active={stockFilter === 'out' || undefined} onClick={() => setStockFilter('out')}>{tx("Out ({0})", [outCount])}</button>
            </div>
          </div>

          {tab === 'catalogue' ? (
            /* CATALOGUE — product details and the shelf (retail) price. Buying
               price is Accounting › Stock value; it is only an input box in the
               product form for people who hold that grant. */
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{tx("Product")}</th>
                      <th>{tx("Category")}</th>
                      <th className="text-right">{tx("Retail price")}</th>
                      <th className="text-center">{tx("In stock")}</th>
                      <th className="text-right">{tx("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>{tx("No products found.")}</td></tr>
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
                            <td className="text-center num font-semibold" style={{ color }} title={allBranches ? tx("Total across branches") : undefined}>{fmt(p.stock)}</td>
                            <td className="text-right">
                              {canEditProducts && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>{tx("Edit")}</button>}
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
                      <th>{tx("Product")}</th>
                      <th>{tx("Category")}</th>
                      <th className="text-center">{tx("Stock")}</th>
                      <th className="text-center">{tx("Low at")}</th>
                      <th className="text-right">{tx("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>{tx("No products found.")}</td></tr>
                    ) : (
                      filtered.map((p) => {
                        const out = p.stock <= 0;
                        const low = !out && p.stock <= p.lowStockAt;
                        const color = out ? 'var(--color-brand)' : low ? 'var(--color-warn)' : 'var(--color-strong)';
                        return (
                          <Fragment key={p.id}>
                          <tr style={{ opacity: p.active ? 1 : 0.5 }}>
                            <td><ProductCell p={p} allBranches={allBranches} /></td>
                            <td><span className="chip" style={{ cursor: 'default' }}>{p.category}</span></td>
                            <td>
                              {stockEditable ? (
                                <StockStepper id={p.id} branchId={activeScope} value={p.stock} lowStockAt={p.lowStockAt} />
                              ) : (
                                <div className="text-center num font-semibold" style={{ color }} title={allBranches ? tx("Total across branches") : undefined}>{fmt(p.stock)}</div>
                              )}
                            </td>
                            <td className="text-center num" style={{ color: 'var(--color-muted)' }}>{allBranches ? '—' : fmt(p.lowStockAt)}</td>
                            <td className="text-right">
                              {canManageStock && (
                                <span className="inline-flex gap-1.5">
                                  <button className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => setReceiving(p)}>{tx("+ Receive")}</button>
                                  {stockEditable && (
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ whiteSpace: 'nowrap', color: 'var(--color-brand)' }}
                                      disabled={p.stock <= 0}
                                      onClick={() => setWritingOff(writingOff === p.id ? null : p.id)}
                                    >
                                      {tx("Write off")}
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                          {writingOff === p.id && (
                            <WriteOffRow
                              product={p}
                              branchId={activeScope}
                              onClose={() => setWritingOff(null)}
                              onDone={() => { setWritingOff(null); refresh(); }}
                            />
                          )}
                          </Fragment>
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
        <HistoryTable history={history} allBranches={allBranches} />
      )}

      {tab === 'transfers' && canManageStock && allBranchAccess && (
        <TransfersTab transfers={transfers} storeName={storeName} />
      )}

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
          allBranches={allBranches}
          branches={activeBranches}
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

// One-line write-off form shown under a product row: reason, quantity, note.
// Removes the units from stock and logs the loss at FIFO cost.
function WriteOffRow({
  product, branchId, onClose, onDone,
}: {
  product: StockProduct;
  branchId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const tx = useT();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<'EXPIRED' | 'DAMAGED'>('EXPIRED');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const q = parseAmount(qty);

  function submit() {
    if (q <= 0) { toast(tx("Enter how many units to write off."), true); return; }
    if (q > product.stock) { toast(tx("Only {0} on hand.", [product.stock]), true); return; }
    start(async () => {
      const res = await writeOffStock({ productId: product.id, branchId, qty: q, reason, note });
      if (res.ok) { toast(tx("Wrote off {0} × {1}", [q, product.name])); onDone(); }
      else toast(res.error, true);
    });
  }

  return (
    <tr>
      <td colSpan={5} style={{ background: 'var(--color-ink-1)' }}>
        <div className="flex items-center gap-2 flex-nowrap">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-brand)', whiteSpace: 'nowrap' }}>{tx("Write off")}</span>
          <select className="input" style={{ width: 120 }} value={reason} onChange={(e) => setReason(e.target.value as 'EXPIRED' | 'DAMAGED')}>
            <option value="EXPIRED">{tx("Expired")}</option>
            <option value="DAMAGED">{tx("Damaged")}</option>
          </select>
          <input
            className="input num"
            style={{ width: 90 }}
            inputMode="numeric"
            placeholder={tx("Qty (max {0})", [product.stock])}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
          />
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder={tx("Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={submit} aria-busy={pending} disabled={pending}>{pending ? tx("Saving…") : tx("Confirm")}</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>{tx("Cancel")}</button>
        </div>
      </td>
    </tr>
  );
}

// Receive a supplier delivery into the active branch. The buying price field is
// only offered to finance users; everyone else just records the quantity.
function ReceiveModal({
  product, branchId: scopeBranchId, branchName, allBranches, branches, canSeeCost, currency, onClose, onDone,
}: {
  product: StockProduct;
  branchId: string;
  branchName: string;
  /** On "All branches" the person picks which branch receives the delivery. */
  allBranches: boolean;
  branches: BranchOpt[];
  canSeeCost: boolean;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const tx = useT();
  const [pending, start] = useTransition();
  const [pickedBranch, setPickedBranch] = useState('');
  const branchId = allBranches ? pickedBranch : scopeBranchId;
  const targetName = allBranches ? branches.find((b) => b.id === pickedBranch)?.name ?? '' : branchName;
  const onHand = allBranches
    ? product.perBranch.find((b) => b.branchId === pickedBranch)?.stock ?? 0
    : product.stock;
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState(product.cost > 0 ? String(product.cost) : '');
  const [price, setPrice] = useState(product.price > 0 ? String(product.price) : '');
  const [note, setNote] = useState('');

  const q = parseAmount(qty);
  const cost = parseAmount(unitCost);
  const retail = parseAmount(price);

  function submit() {
    if (!branchId) { toast(tx("Pick the branch that received the stock."), true); return; }
    if (q <= 0) { toast(tx("Enter the quantity received."), true); return; }
    if (retail <= 0) { toast(tx("Enter the retail price."), true); return; }
    start(async () => {
      const res = await receiveStock({
        productId: product.id,
        branchId,
        qty: q,
        price: retail,
        unitCost: canSeeCost && cost > 0 ? cost : undefined,
        note,
      });
      if (res.ok) { toast(tx("Received {0} × {1}", [q, product.name])); onDone(); }
      else toast(res.error, true);
    });
  }

  return (
    <Modal
      title={tx("Receive stock")}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={pending}>{tx("Cancel")}</button>
          <button className="btn btn-primary" onClick={submit} aria-busy={pending} disabled={pending}>{pending ? tx("Saving…") : tx("Receive")}</button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-strong font-semibold">{product.name}</div>
          {(!allBranches || branchId) && (
            <div className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
              {tx("{0} · on hand now", [targetName])}{' '}<b className="num" style={{ color: 'var(--color-strong)' }}>{fmt(onHand)}</b>
              {q > 0 && <> → <b className="num" style={{ color: 'var(--color-strong)' }}>{fmt(onHand + q)}</b></>}
            </div>
          )}
        </div>
        {allBranches && (
          <label className="block">
            <span className="field-label">{tx("Branch *")}</span>
            <select className="input" value={pickedBranch} onChange={(e) => setPickedBranch(e.target.value)}>
              <option value="">{tx("Select a branch…")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="field-label">{tx("Quantity received")}</span>
          <input className="input num" inputMode="numeric" autoFocus value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
        </label>
        <label className="block">
          <span className="field-label">{tx("Retail price ({0}) *", [currency])}</span>
          <input className="input num" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
          <span className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
            {tx("Required. If this differs from the current retail price, the product's retail price is updated and the change is logged in Price history.")}
          </span>
        </label>
        {canSeeCost && (
          <label className="block">
            <span className="field-label">{tx("Buying price per unit ({0}) — optional", [currency])}</span>
            <input className="input num" inputMode="numeric" value={unitCost} onChange={(e) => setUnitCost(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
            <span className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
              {tx("If entered and different from the current buying price, it is updated and logged in Price history.")}
            </span>
          </label>
        )}
        <label className="block">
          <span className="field-label">{tx("Note (optional)")}</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("e.g. Supplier invoice no.")} />
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

function HistoryTable({ history, allBranches }: { history: MovementRow[]; allBranches: boolean }) {
  const tx = useT();
  const [type, setType] = useState<'all' | MovementType>('all');
  const types = Object.keys(MOVEMENT_LABELS) as MovementType[];
  const shown = type === 'all' ? history : history.filter((m) => m.type === type);

  return (
    <>
      <div className="flex gap-2 flex-wrap mb-4">
        <button className="chip" data-active={type === 'all' || undefined} onClick={() => setType('all')}>{tx("All")}</button>
        {types.map((t) => (
          <button key={t} className="chip" data-active={type === t || undefined} onClick={() => setType(t)}>{tx(MOVEMENT_LABELS[t])}</button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{tx("When")}</th>
                <th>{tx("Product")}</th>
                {allBranches && <th>{tx("Branch")}</th>}
                <th>{tx("Type")}</th>
                <th className="text-center">{tx("Change")}</th>
                <th className="text-center">{tx("Balance")}</th>
                <th>{tx("Note")}</th>
                <th>{tx("By")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={allBranches ? 8 : 7} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>{tx("No movements yet.")}</td></tr>
              ) : (
                shown.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap" style={{ color: 'var(--color-muted)', fontSize: 12 }}>{fmtDateTime(m.createdAt)}</td>
                    <td className="text-strong">{m.productName}</td>
                    {allBranches && <td style={{ color: 'var(--color-muted)' }}>{m.branchName}</td>}
                    <td><span className="chip" style={{ cursor: 'default', color: TYPE_TONE[m.type] }}>{tx(MOVEMENT_LABELS[m.type as MovementType] ?? m.type)}</span></td>
                    <td className="text-center num font-semibold" style={{ color: m.delta >= 0 ? 'var(--color-strong)' : 'var(--color-brand)' }}>{m.delta >= 0 ? `+${fmt(m.delta)}` : fmt(m.delta)}</td>
                    <td className="text-center num">{fmt(m.balanceAfter)}</td>
                    <td style={{ color: 'var(--color-muted)', fontSize: 12 }}>{m.note || '—'}</td>
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
