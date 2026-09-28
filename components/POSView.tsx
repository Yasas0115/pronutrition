'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, fmt, parseAmount } from '@/lib/money';
import { toast } from './toast';
import Modal from './Modal';
import ReceiptModal from './ReceiptModal';
import { checkoutAction, type Receipt } from '@/app/actions';

type Product = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  flavor: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  imageUrl: string | null;
  stock: number;
  lowStockAt: number;
};

type PaymentMethod = { key: string; label: string; discountPercent: number };

type Line = { product: Product; qty: number };

export default function POSView({
  products,
  paymentMethods,
  currency,
  taxPercent,
  storeName,
  storePhone,
  storeAddress,
  receiptNote,
  branchName,
  cashierName,
}: {
  products: Product[];
  paymentMethods: PaymentMethod[];
  currency: string;
  taxPercent: number;
  storeName: string;
  storePhone: string | null;
  storeAddress: string | null;
  receiptNote: string | null;
  branchName: string;
  cashierName: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [discount, setDiscount] = useState(0); // manual discount (Rs), on top of method %
  const [method, setMethod] = useState<string>(paymentMethods[0]?.key ?? 'CASH');
  const [paid, setPaid] = useState<number>(0);
  const [customer, setCustomer] = useState('');
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'All' && p.category !== cat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        (p.flavor ?? '').toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, query, cat]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lines: Line[] = useMemo(() => {
    const out: Line[] = [];
    for (const [id, qty] of cart) {
      const product = byId.get(id);
      if (product) out.push({ product, qty });
    }
    return out;
  }, [cart, byId]);

  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const selectedMethod = paymentMethods.find((m) => m.key === method);
  const methodPercent = selectedMethod?.discountPercent ?? 0;
  const methodDiscount = Math.min(subtotal, Math.round((subtotal * methodPercent) / 100));
  const manualDiscount = Math.max(0, Math.min(discount, subtotal - methodDiscount));
  const totalDiscount = methodDiscount + manualDiscount;
  const taxed = subtotal - totalDiscount;
  const tax = Math.round((taxed * taxPercent) / 100);
  const total = taxed + tax;
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const isCash = method === 'CASH';
  const change = isCash ? Math.max(0, paid - total) : 0;
  const shortfall = isCash ? Math.max(0, total - paid) : 0;

  const stockOf = (p: Product) => p.stock - (cart.get(p.id) ?? 0);

  function add(p: Product) {
    if (stockOf(p) <= 0) {
      toast(`${p.name} is out of stock.`, true);
      return;
    }
    setCart((prev) => {
      const next = new Map(prev);
      next.set(p.id, (next.get(p.id) ?? 0) + 1);
      return next;
    });
  }

  function setQty(id: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      const p = byId.get(id);
      if (!p) return next;
      const clamped = Math.max(0, Math.min(qty, p.stock));
      if (clamped === 0) next.delete(id);
      else next.set(id, clamped);
      return next;
    });
  }

  function clearCart() {
    setCart(new Map());
    setDiscount(0);
    setPaid(0);
    setCustomer('');
    setMethod(paymentMethods[0]?.key ?? 'CASH');
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const q = query.trim().toLowerCase();
    if (!q) return;
    // Exact barcode / sku wins (scanner types it then hits Enter).
    const exact = products.find(
      (p) => p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q,
    );
    const hit = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (hit) {
      add(hit);
      setQuery('');
    }
  }

  // Left/Right (and Home/End) switch the selected category so the highlight
  // moves and the product grid filters live; the strip scrolls to keep the
  // active chip in view.
  function onChipsKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const cur = categories.indexOf(cat);
    let idx: number;
    if (e.key === 'Home') idx = 0;
    else if (e.key === 'End') idx = categories.length - 1;
    else if (e.key === 'ArrowRight') idx = Math.min(categories.length - 1, cur + 1);
    else idx = Math.max(0, cur - 1);
    if (idx === cur) return;
    setCat(categories[idx]);
    const chip = chipsRef.current?.querySelectorAll<HTMLButtonElement>('.chip')[idx];
    chip?.focus();
    chip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  async function checkout() {
    if (lines.length === 0) return;
    if (isCash && paid < total) {
      toast('Cash received is less than the total.', true);
      return;
    }
    setProcessing(true);
    const res = await checkoutAction({
      items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
      manualDiscount,
      method,
      paid: isCash ? paid : total,
      customerName: customer,
    });
    setProcessing(false);
    if (res.ok) {
      setReceipt(res.receipt);
      setMobileCartOpen(false);
      clearCart();
      router.refresh(); // pull fresh stock counts
      toast(`Sale #${res.receipt.number} completed`);
    } else {
      toast(res.error, true);
      router.refresh();
    }
  }

  const quickCash = [total, 1000, 2000, 5000];

  const renderCart = (variant: 'panel' | 'modal') => {
    const panel = variant === 'panel';
    return (
    <div className={`cart${panel ? ' lg:min-h-full' : ''}`}>
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)', flexShrink: 0 }}>
        <div className="brand" style={{ fontSize: 18 }}>Cart</div>
        <div className="flex items-center gap-3">
          <span className="text-[13px]" style={{ color: 'var(--color-muted)' }}>{count} item{count === 1 ? '' : 's'}</span>
          {lines.length > 0 && (
            <button className="text-[12px] uppercase tracking-wider" style={{ color: 'var(--color-brand)' }} onClick={clearCart}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div
        className="overflow-y-auto"
        style={panel ? { flex: '1 1 0', minHeight: 96 } : { maxHeight: 'min(42vh, 380px)' }}
      >
        {lines.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13.5px]" style={{ color: 'var(--color-faint)' }}>
            Press “Add” on a product to add it to the cart.
          </div>
        ) : (
          lines.map((l) => (
            <div className="cart__row" key={l.product.id}>
              <div>
                <div className="cart__name">{l.product.name}</div>
                <div className="cart__meta">{money(l.product.price, currency)} each</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="num text-strong font-semibold">{money(l.product.price * l.qty, currency)}</div>
                <div className="flex items-center gap-1.5">
                  <button className="qtybtn" onClick={() => setQty(l.product.id, l.qty - 1)} aria-label="Decrease">−</button>
                  <span className="num w-7 text-center text-[14px] text-strong">{l.qty}</span>
                  <button className="qtybtn" onClick={() => setQty(l.product.id, l.qty + 1)} aria-label="Increase" disabled={l.qty >= l.product.stock}>+</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--color-line)', flexShrink: 0 }}>
        {/* Discount + customer */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="field-label">Discount ({currency})</label>
            <input
              className="input"
              inputMode="numeric"
              value={discount ? String(discount) : ''}
              placeholder="0"
              onChange={(e) => setDiscount(parseAmount(e.target.value))}
            />
          </div>
          <div>
            <label className="field-label">Customer</label>
            <input
              className="input"
              value={customer}
              placeholder="Walk-in"
              onChange={(e) => setCustomer(e.target.value)}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="summary-row"><span>Subtotal</span><span className="num">{money(subtotal, currency)}</span></div>
          {methodDiscount > 0 && (
            <div className="summary-row" style={{ color: 'var(--color-brand)' }}>
              <span>{selectedMethod?.label ?? method} discount ({methodPercent}%)</span>
              <span className="num">− {money(methodDiscount, currency)}</span>
            </div>
          )}
          {manualDiscount > 0 && (
            <div className="summary-row" style={{ color: 'var(--color-brand)' }}><span>Extra discount</span><span className="num">− {money(manualDiscount, currency)}</span></div>
          )}
          {tax > 0 && (
            <div className="summary-row"><span>Tax ({taxPercent}%)</span><span className="num">{money(tax, currency)}</span></div>
          )}
          <div className="summary-row total pt-1"><span>Total</span><span className="num amt">{money(total, currency)}</span></div>
        </div>

        {/* Payment method */}
        <div>
          <label className="field-label">Payment method</label>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(paymentMethods.length, 3)}, 1fr)` }}>
            {paymentMethods.map((m) => (
              <button
                key={m.key}
                className="btn"
                onClick={() => { setMethod(m.key); if (m.key !== 'CASH') setPaid(0); }}
                style={
                  method === m.key
                    ? { background: 'rgba(239,68,68,.12)', color: 'var(--color-brand)', borderColor: 'var(--color-brand)', flexDirection: 'column', height: 'auto', padding: '8px 6px' }
                    : { background: 'var(--color-ink-1)', color: 'var(--color-ash)', borderColor: 'var(--color-line-2)', flexDirection: 'column', height: 'auto', padding: '8px 6px' }
                }
              >
                <span>{m.label}</span>
                <span style={{ fontSize: 10, opacity: 0.8 }}>{m.discountPercent > 0 ? `${m.discountPercent}% off` : 'no disc.'}</span>
              </button>
            ))}
          </div>
        </div>

        {isCash && (
          <div className="flex flex-col gap-2">
            <label className="field-label">Cash received</label>
            <input
              className="input num"
              inputMode="numeric"
              value={paid ? String(paid) : ''}
              placeholder="0"
              onChange={(e) => setPaid(parseAmount(e.target.value))}
            />
            <div className="grid grid-cols-4 gap-2">
              {quickCash.map((v, i) => (
                <button key={i} className="btn btn-ghost btn-sm" onClick={() => setPaid(v)}>
                  {i === 0 ? 'Exact' : fmt(v)}
                </button>
              ))}
            </div>
            <div className="summary-row pt-1">
              <span style={{ color: shortfall > 0 ? 'var(--color-brand)' : 'var(--color-ok)' }}>
                {shortfall > 0 ? 'Shortfall' : 'Change'}
              </span>
              <span className="num" style={{ color: shortfall > 0 ? 'var(--color-brand)' : 'var(--color-ok)' }}>
                {money(shortfall > 0 ? shortfall : change, currency)}
              </span>
            </div>
          </div>
        )}

        <button
          className="btn btn-primary btn-block"
          style={{ padding: '14px 18px', fontSize: 17 }}
          disabled={lines.length === 0 || processing || (isCash && paid < total)}
          onClick={checkout}
        >
          {processing ? 'Processing…' : `Charge ${money(total, currency)}`}
        </button>
      </div>
    </div>
    );
  };

  return (
    <>
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="page-title">Point of Sale</h1>
          <p className="page-sub">Selling at <b style={{ color: 'var(--color-strong)' }}>{branchName}</b> · press <b style={{ color: 'var(--color-strong)' }}>Add</b> on a product to build the cart.</p>
        </div>
      </div>

      <div className="lg:flex lg:gap-6 lg:h-[calc(100vh_-_190px)]">
        {/* Left: search + grid (grid scrolls on its own) */}
        <div className="flex-1 min-w-0 lg:flex lg:flex-col lg:min-h-0">
          <div className="mb-4 lg:shrink-0">
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                className="input"
                style={{ paddingLeft: '2.75rem' }}
                placeholder="Search or scan barcode…  (Enter to add)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                autoFocus
              />
            </div>
            <div
              ref={chipsRef}
              role="tablist"
              aria-label="Product categories"
              className="flex gap-2 overflow-x-auto mt-3 pb-1"
              onKeyDown={onChipsKey}
            >
              {categories.map((c) => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={cat === c}
                  tabIndex={cat === c ? 0 : -1}
                  className="chip"
                  data-active={cat === c || undefined}
                  onClick={() => setCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:-mr-1 lg:pr-1">
          {filtered.length === 0 ? (
            <div className="card p-10 text-center" style={{ color: 'var(--color-faint)' }}>
              No products match “{query}”.
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {filtered.map((p) => {
                const left = stockOf(p);
                const out = left <= 0;
                const low = !out && left <= p.lowStockAt;
                return (
                  <div key={p.id} className="prod" data-out={out || undefined}>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="prod__img" src={p.imageUrl} alt="" />
                    ) : (
                      <div className="prod__img prod__img--ph" aria-hidden>
                        <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="m21 15-5-5L5 21" />
                        </svg>
                      </div>
                    )}
                    <span className="prod__cat">{p.category}</span>
                    <span className="prod__name">{p.name}</span>
                    <span className="prod__foot">
                      <span className="prod__price">{money(p.price, currency)}</span>
                      <span className={`prod__stock ${out ? 'out' : low ? 'low' : ''}`}>
                        {out ? 'Out' : `${left} left`}
                      </span>
                    </span>
                    <button
                      className="btn btn-primary btn-sm btn-block prod__add"
                      onClick={() => add(p)}
                      disabled={out}
                    >
                      {out ? 'Out of stock' : '+ Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/* Right: cart (desktop) — billing stays pinned; the column itself
            scrolls when the billing section is taller than the viewport so
            the Charge button is never clipped. */}
        <div className="hidden lg:block w-[380px] shrink-0 lg:h-[calc(100vh_-_190px)] lg:overflow-y-auto">
          {renderCart('panel')}
        </div>
      </div>

      {/* Mobile: sticky bottom bar + cart modal */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 no-print px-4 pb-4 pt-3"
        style={{ background: 'linear-gradient(to top, var(--color-ink-0) 60%, transparent)' }}>
        <button
          className="btn btn-primary btn-block flex items-center justify-between"
          style={{ padding: '14px 18px' }}
          onClick={() => setMobileCartOpen(true)}
          disabled={lines.length === 0}
        >
          <span>{count} item{count === 1 ? '' : 's'}</span>
          <span>View cart · {money(total, currency)}</span>
        </button>
      </div>

      {mobileCartOpen && (
        <Modal title="Cart" onClose={() => setMobileCartOpen(false)} maxWidth={440}>
          {renderCart('modal')}
        </Modal>
      )}

      {receipt && (
        <ReceiptModal
          receipt={receipt}
          currency={currency}
          store={{ name: storeName, phone: storePhone, address: storeAddress, note: receiptNote }}
          onClose={() => setReceipt(null)}
        />
      )}
    </>
  );
}
