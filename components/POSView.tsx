'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, fmt, parseAmount } from '@/lib/money';
import { toast } from './toast';
import Modal from './Modal';
import ReceiptModal from './ReceiptModal';
import { checkoutAction, type Receipt } from '@/app/actions';
import { saveCustomer, getTillAccount, type TillAccount } from '@/app/customers/actions';
import { fmtDate } from '@/lib/dates';

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

type PaymentMethod = {
  key: string;
  label: string;
  discountPercent: number;
  requiresCustomer: boolean; // walk-ins can't use it
  allowsPartial: boolean; // credit: pay part now, rest later
};

type CustomerOpt = {
  id: string;
  name: string;
  phone: string | null;
  type: 'RETAIL' | 'SHOP';
  due: number; // what they already owe
};

type Line = { product: Product; qty: number };
type SaleType = 'RETAIL' | 'WHOLESALE';

// How the "paid now" part of a credit sale can be taken.
const PAID_VIA = [
  { key: 'CASH', label: 'Cash' },
  { key: 'CARD', label: 'Card' },
  { key: 'BANK', label: 'Bank transfer' },
];

export default function POSView({
  products,
  paymentMethods,
  customers,
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
  customers: CustomerOpt[];
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
  const [paid, setPaid] = useState<number>(0); // cash received, or credit "paid now"
  const [paidVia, setPaidVia] = useState('CASH'); // how the credit "paid now" was taken
  const [saleType, setSaleType] = useState<SaleType>('RETAIL');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [custQuery, setCustQuery] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [debtWarn, setDebtWarn] = useState(false); // "this customer already owes" confirm
  const [account, setAccount] = useState<TillAccount | null>(null); // read-only balance view
  const [extraCustomers, setExtraCustomers] = useState<CustomerOpt[]>([]); // registered this session
  const [priceOverrides, setPriceOverrides] = useState<Map<string, number>>(new Map()); // wholesale
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Ready the search box for a barcode scanner on tills with a mouse/keyboard.
  // Skipped on touch screens, where focusing it would pop the on-screen
  // keyboard up over the product grid as soon as the page opens.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus();
  }, []);

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

  const allCustomers = useMemo(() => {
    const seen = new Set(extraCustomers.map((c) => c.id));
    return [...extraCustomers, ...customers.filter((c) => !seen.has(c.id))];
  }, [customers, extraCustomers]);
  const customer = allCustomers.find((c) => c.id === customerId) ?? null;

  const custMatches = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    const pool = q
      ? allCustomers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      : allCustomers;
    return pool.slice(0, 6);
  }, [allCustomers, custQuery]);

  const lines: Line[] = useMemo(() => {
    const out: Line[] = [];
    for (const [id, qty] of cart) {
      const product = byId.get(id);
      if (product) out.push({ product, qty });
    }
    return out;
  }, [cart, byId]);

  const wholesale = saleType === 'WHOLESALE';
  // Wholesale: the cashier can edit a line's price. Retail: always the shelf price.
  const unitPrice = (p: Product) => (wholesale ? priceOverrides.get(p.id) ?? p.price : p.price);

  const subtotal = lines.reduce((s, l) => s + unitPrice(l.product) * l.qty, 0);
  const selectedMethod = paymentMethods.find((m) => m.key === method);
  // Wholesale is priced by hand, so the payment-method % discount is skipped
  // (the server enforces the same rule).
  const methodPercent = wholesale ? 0 : selectedMethod?.discountPercent ?? 0;
  const methodDiscount = Math.min(subtotal, Math.round((subtotal * methodPercent) / 100));
  const manualDiscount = Math.max(0, Math.min(discount, subtotal - methodDiscount));
  const totalDiscount = methodDiscount + manualDiscount;
  const taxed = subtotal - totalDiscount;
  const tax = Math.round((taxed * taxPercent) / 100);
  const total = taxed + tax;
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const isCash = method === 'CASH';
  const isCredit = !!selectedMethod?.allowsPartial;
  const change = isCash ? Math.max(0, paid - total) : 0;
  const shortfall = isCash ? Math.max(0, total - paid) : 0;
  const balanceLater = isCredit ? Math.max(0, total - paid) : 0;
  const creditOver = isCredit && paid > total;

  // Walk-ins can only use methods that don't need a registered customer, and a
  // wholesale sale always needs one.
  const needsCustomer = wholesale || !!selectedMethod?.requiresCustomer;
  const blockedNoCustomer = needsCustomer && !customer;
  const firstWalkInMethod = paymentMethods.find((m) => !m.requiresCustomer)?.key ?? paymentMethods[0]?.key ?? 'CASH';

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

  function setOverride(id: string, value: number) {
    setPriceOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  }

  function chooseCustomer(id: string | null) {
    setCustomerId(id);
    setCustQuery('');
    setCustOpen(false);
    // Back to walk-in: drop a method that needs a registered customer.
    if (!id && !wholesale && selectedMethod?.requiresCustomer) {
      setMethod(firstWalkInMethod);
      setPaid(0);
    }
  }

  function changeSaleType(next: SaleType) {
    setSaleType(next);
    if (next === 'RETAIL') {
      setPriceOverrides(new Map());
      if (!customer && selectedMethod?.requiresCustomer) {
        setMethod(firstWalkInMethod);
        setPaid(0);
      }
    }
  }

  function chooseMethod(m: PaymentMethod) {
    if (m.requiresCustomer && !customer && !wholesale) {
      toast(`${m.label} needs a registered customer — pick one first.`, true);
      return;
    }
    setMethod(m.key);
    setPaid(0);
    setPaidVia('CASH');
  }

  function clearCart() {
    setCart(new Map());
    setDiscount(0);
    setPaid(0);
    setPaidVia('CASH');
    setCustomerId(null);
    setCustQuery('');
    setSaleType('RETAIL');
    setPriceOverrides(new Map());
    setMethod(firstWalkInMethod);
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

  async function showAccount() {
    if (!customer) return;
    const res = await getTillAccount(customer.id);
    if (res.ok) setAccount(res.account);
    else toast(res.error, true);
  }

  async function checkout(confirmedDebt = false) {
    if (lines.length === 0) return;
    if (blockedNoCustomer) {
      toast(wholesale ? 'Pick the customer (shop) for a wholesale sale.' : `${selectedMethod?.label ?? 'This method'} needs a registered customer.`, true);
      return;
    }
    if (isCash && paid < total) {
      toast('Cash received is less than the total.', true);
      return;
    }
    if (creditOver) {
      toast('The paid-now amount cannot be more than the total.', true);
      return;
    }
    // A credit sale for someone who already owes: show what they owe and what
    // they will owe after this bill, and let the cashier confirm.
    if (isCredit && customer && customer.due > 0 && !confirmedDebt) {
      setDebtWarn(true);
      return;
    }
    setProcessing(true);
    const res = await checkoutAction({
      items: lines.map((l) => ({
        productId: l.product.id,
        qty: l.qty,
        ...(wholesale ? { price: unitPrice(l.product) } : {}),
      })),
      manualDiscount,
      method,
      paid: isCash || isCredit ? paid : total,
      paidVia: isCredit && paid > 0 ? paidVia : undefined,
      customerId: customer?.id ?? null,
      saleType,
    });
    setProcessing(false);
    if (res.ok) {
      setReceipt(res.receipt);
      setMobileCartOpen(false);
      clearCart();
      router.refresh(); // pull fresh stock counts + customer balances
      toast(`Sale #${res.receipt.number} completed`);
    } else {
      toast(res.error, true);
      router.refresh();
    }
  }

  const quickCash = [total, 1000, 2000, 5000];

  const chargeLabel = isCredit
    ? paid > 0
      ? `Charge ${money(total, currency)} · ${money(paid, currency)} now`
      : `Credit sale ${money(total, currency)}`
    : `Charge ${money(total, currency)}`;

  const chargeButton = (
    <button
      className="btn btn-primary btn-block"
      style={{ padding: '14px 18px', fontSize: 17 }}
      disabled={lines.length === 0 || processing || blockedNoCustomer || creditOver || (isCash && paid < total)}
      onClick={() => checkout()}
    >
      {processing ? 'Processing…' : chargeLabel}
    </button>
  );

  // `panel` = the desktop side column. `modal` = the phone bottom sheet: the
  // sheet already has its own "Cart" title and border, so the inner card
  // chrome is dropped, the whole sheet scrolls as one, and the Charge button
  // moves to the sheet's sticky footer so it is always on screen.
  const renderCart = (variant: 'panel' | 'modal') => {
    const panel = variant === 'panel';
    return (
    <div
      className={`cart${panel ? ' lg:min-h-full' : ''}`}
      style={panel ? undefined : { border: 0, borderRadius: 0, background: 'transparent', overflow: 'visible' }}
    >
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--color-line)', flexShrink: 0 }}>
        {panel ? (
          <div className="brand" style={{ fontSize: 18 }}>Cart</div>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--color-muted)' }}>{count} item{count === 1 ? '' : 's'}</span>
        )}
        <div className="flex items-center gap-3">
          {panel && (
            <span className="text-[13px]" style={{ color: 'var(--color-muted)' }}>{count} item{count === 1 ? '' : 's'}</span>
          )}
          {lines.length > 0 && (
            <button className="text-[12px] uppercase tracking-wider" style={{ color: 'var(--color-brand)' }} onClick={clearCart}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Retail / Wholesale */}
      <div className="px-4 pt-3 flex gap-2" style={{ flexShrink: 0 }}>
        <button className="chip" data-active={!wholesale || undefined} onClick={() => changeSaleType('RETAIL')}>Retail</button>
        <button className="chip" data-active={wholesale || undefined} onClick={() => changeSaleType('WHOLESALE')}>Wholesale (shop)</button>
      </div>

      <div
        className={panel ? 'overflow-y-auto' : undefined}
        style={panel ? { flex: '1 1 0', minHeight: 96 } : undefined}
      >
        {lines.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13.5px]" style={{ color: 'var(--color-faint)' }}>
            Press “Add” on a product to add it to the cart.
          </div>
        ) : (
          lines.map((l) => {
            const unit = unitPrice(l.product);
            return (
              <div className="cart__row" key={l.product.id}>
                <div>
                  <div className="cart__name">{l.product.name}</div>
                  {wholesale ? (
                    <div className="cart__meta flex items-center gap-1.5">
                      <input
                        className="input num"
                        inputMode="numeric"
                        aria-label={`Price for ${l.product.name}`}
                        style={{ height: 30, width: 92, padding: '0 8px', fontSize: 13 }}
                        value={String(unit)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setOverride(l.product.id, parseAmount(e.target.value))}
                      />
                      <span>each{unit !== l.product.price && ` (list ${fmt(l.product.price)})`}</span>
                    </div>
                  ) : (
                    <div className="cart__meta">{money(unit, currency)} each</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="num text-strong font-semibold">{money(unit * l.qty, currency)}</div>
                  <div className="flex items-center gap-1.5">
                    <button className="qtybtn" onClick={() => setQty(l.product.id, l.qty - 1)} aria-label="Decrease">−</button>
                    <span className="num w-7 text-center text-[14px] text-strong">{l.qty}</span>
                    <button className="qtybtn" onClick={() => setQty(l.product.id, l.qty + 1)} aria-label="Increase" disabled={l.qty >= l.product.stock}>+</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--color-line)', flexShrink: 0 }}>
        {/* Customer: walk-in by default; a registered customer is needed for
            Koko / Bank transfer / Credit and for every wholesale sale. */}
        <div>
          <label className="field-label">
            Customer {needsCustomer && <span style={{ color: 'var(--color-brand)' }}>· required</span>}
          </label>
          {customer ? (
            <div
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
              style={{ background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}
            >
              <div className="min-w-0">
                <div className="text-strong font-semibold text-[13.5px] truncate">{customer.name}</div>
                <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                  {[customer.type === 'SHOP' ? 'Shop' : 'Customer', customer.phone].filter(Boolean).join(' · ')}
                  {customer.due > 0 && (
                    <span style={{ color: 'var(--color-warn)' }}> · owes {money(customer.due, currency)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button className="text-[12px] uppercase tracking-wider" style={{ color: 'var(--color-muted)' }} onClick={showAccount}>
                  Balance
                </button>
                <button className="text-[12px] uppercase tracking-wider" style={{ color: 'var(--color-brand)' }} onClick={() => chooseCustomer(null)}>
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <input
                className="input"
                value={custQuery}
                placeholder={needsCustomer ? 'Search name / phone to pick…' : 'Walk-in — search to pick a customer'}
                onChange={(e) => { setCustQuery(e.target.value); setCustOpen(true); }}
                onFocus={() => setCustOpen(true)}
              />
              {custOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10 cursor-default"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setCustOpen(false)}
                  />
                  <div
                    className="absolute left-0 right-0 z-20 card p-1 mt-1 animate-pop"
                    style={{ boxShadow: 'var(--shadow-pop)', maxHeight: 260, overflowY: 'auto' }}
                  >
                    {custMatches.length === 0 ? (
                      <div className="px-3 py-2 text-[13px]" style={{ color: 'var(--color-faint)' }}>No customer matches.</div>
                    ) : (
                      custMatches.map((c) => (
                        <button key={c.id} type="button" className="menu-item" onClick={() => chooseCustomer(c.id)}>
                          <span className="flex-1 text-left min-w-0">
                            <span className="block text-strong truncate">{c.name}</span>
                            <span className="block text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                              {[c.type === 'SHOP' ? 'Shop' : null, c.phone].filter(Boolean).join(' · ') || '—'}
                              {c.due > 0 && ` · owes ${money(c.due, currency)}`}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                    <button
                      type="button"
                      className="menu-item"
                      style={{ color: 'var(--color-brand)' }}
                      onClick={() => { setCustOpen(false); setNewCustomerOpen(true); }}
                    >
                      + New customer
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

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
            {paymentMethods.map((m) => {
              // A walk-in can't pick a method that needs a registered customer.
              const locked = m.requiresCustomer && !customer && !wholesale;
              const selected = method === m.key;
              return (
                <button
                  key={m.key}
                  className="btn"
                  onClick={() => chooseMethod(m)}
                  aria-disabled={locked || undefined}
                  title={locked ? 'Pick a registered customer first' : undefined}
                  style={{
                    flexDirection: 'column',
                    height: 'auto',
                    padding: '8px 6px',
                    opacity: locked ? 0.5 : 1,
                    ...(selected
                      ? { background: 'rgba(239,68,68,.12)', color: 'var(--color-brand)', borderColor: 'var(--color-brand)' }
                      : { background: 'var(--color-ink-1)', color: 'var(--color-ash)', borderColor: 'var(--color-line-2)' }),
                  }}
                >
                  <span>{m.label}</span>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>
                    {locked
                      ? 'needs customer'
                      : wholesale
                        ? 'no auto disc.'
                        : m.discountPercent > 0
                          ? `${m.discountPercent}% off`
                          : 'no disc.'}
                  </span>
                </button>
              );
            })}
          </div>
          {blockedNoCustomer && (
            <p className="text-[12px] mt-1.5" style={{ color: 'var(--color-warn)' }}>
              {wholesale
                ? 'Wholesale sales need a registered customer — pick the shop above.'
                : `${selectedMethod?.label ?? 'This method'} needs a registered customer — pick one above.`}
            </p>
          )}
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

        {isCredit && (
          <div className="flex flex-col gap-2">
            <label className="field-label">Paid now ({currency}) — leave empty for nothing</label>
            <input
              className="input num"
              inputMode="numeric"
              value={paid ? String(paid) : ''}
              placeholder="0"
              onChange={(e) => setPaid(parseAmount(e.target.value))}
            />
            {paid > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {PAID_VIA.map((v) => (
                  <button
                    key={v.key}
                    className="btn btn-sm"
                    onClick={() => setPaidVia(v.key)}
                    style={
                      paidVia === v.key
                        ? { background: 'rgba(239,68,68,.12)', color: 'var(--color-brand)', borderColor: 'var(--color-brand)' }
                        : { background: 'var(--color-ink-1)', color: 'var(--color-ash)', borderColor: 'var(--color-line-2)' }
                    }
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            <div className="summary-row pt-1">
              <span style={{ color: creditOver ? 'var(--color-brand)' : 'var(--color-warn)' }}>
                {creditOver ? 'More than the total' : `Balance ${customer ? `owed by ${customer.name}` : 'to pay later'}`}
              </span>
              <span className="num" style={{ color: creditOver ? 'var(--color-brand)' : 'var(--color-warn)' }}>
                {money(creditOver ? paid - total : balanceLater, currency)}
              </span>
            </div>
            {customer && customer.due > 0 && (
              <p className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                {customer.name} already owes {money(customer.due, currency)} — total would be{' '}
                <b style={{ color: 'var(--color-strong)' }}>{money(customer.due + balanceLater, currency)}</b>.
              </p>
            )}
          </div>
        )}

        {panel && chargeButton}
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

      {/* Mobile: sticky bottom bar (once something is in the cart) + cart modal */}
      {lines.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 no-print px-4 pb-4 pt-3"
          style={{ background: 'linear-gradient(to top, var(--color-ink-0) 60%, transparent)' }}>
          <button
            className="btn btn-primary btn-block flex items-center justify-between"
            style={{ padding: '14px 18px' }}
            onClick={() => setMobileCartOpen(true)}
          >
            <span>{count} item{count === 1 ? '' : 's'}</span>
            <span>View cart · {money(total, currency)}</span>
          </button>
        </div>
      )}

      {mobileCartOpen && (
        <Modal title="Cart" onClose={() => setMobileCartOpen(false)} maxWidth={440} flush footer={chargeButton}>
          {renderCart('modal')}
        </Modal>
      )}

      {debtWarn && customer && (
        <Modal
          title="This customer already owes"
          onClose={() => setDebtWarn(false)}
          maxWidth={420}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDebtWarn(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { setDebtWarn(false); checkout(true); }}>Continue with credit sale</button>
            </>
          }
        >
          <div className="flex flex-col gap-2 text-[14px]">
            <div className="text-strong font-semibold">{customer.name}</div>
            <div className="flex justify-between"><span>Still to pay (before this bill)</span><b className="num">{money(customer.due, currency)}</b></div>
            <div className="flex justify-between"><span>This bill adds</span><b className="num">+ {money(balanceLater, currency)}</b></div>
            <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--color-line-2)', color: 'var(--color-warn)' }}>
              <span>Will owe in total</span><b className="num">{money(customer.due + balanceLater, currency)}</b>
            </div>
          </div>
        </Modal>
      )}
      {account && (
        <Modal title={`${account.name} — balance`} onClose={() => setAccount(null)} maxWidth={460} footer={<button className="btn btn-primary" onClick={() => setAccount(null)}>Close</button>}>
          <div className="flex flex-col gap-3 text-[13.5px]">
            <div className="flex justify-between text-[15px]"><span>Still to pay</span><b className="num" style={{ color: account.totalDue > 0 ? 'var(--color-warn)' : undefined }}>{money(account.totalDue, currency)}</b></div>
            {account.openSales.length > 0 && (
              <div>
                <div className="field-label">Unpaid bills</div>
                {account.openSales.map((s) => (
                  <div key={s.number} className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--color-line-2)' }}>
                    <span>#{s.number} · {fmtDate(s.createdAt)} <span style={{ color: 'var(--color-muted)' }}>(of {money(s.total, currency)})</span></span>
                    <b className="num">{money(s.balanceDue, currency)}</b>
                  </div>
                ))}
              </div>
            )}
            {account.recentPayments.length > 0 && (
              <div>
                <div className="field-label">Recent payments</div>
                {account.recentPayments.map((p, i) => (
                  <div key={i} className="flex justify-between py-1 text-[12.5px]" style={{ color: 'var(--color-muted)' }}>
                    <span>{fmtDate(p.createdAt)} · {p.kind === 'SETTLEMENT' ? 'paid off' : 'paid at sale'} #{p.saleNumber} · {p.method}</span>
                    <span className="num">{money(p.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
      {newCustomerOpen && (
        <NewCustomerModal
          defaultType={wholesale ? 'SHOP' : 'RETAIL'}
          onClose={() => setNewCustomerOpen(false)}
          onCreated={(c) => {
            setExtraCustomers((prev) => [{ ...c, due: 0 }, ...prev]);
            chooseCustomer(c.id);
            setNewCustomerOpen(false);
          }}
        />
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

// Register a customer without leaving the till. Cashiers can add new customers
// but only the Customers module can edit them afterwards.
function NewCustomerModal({
  defaultType,
  onClose,
  onCreated,
}: {
  defaultType: 'RETAIL' | 'SHOP';
  onClose: () => void;
  onCreated: (c: { id: string; name: string; phone: string | null; type: 'RETAIL' | 'SHOP' }) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<'RETAIL' | 'SHOP'>(defaultType);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast('Enter the customer name.', true); return; }
    setSaving(true);
    const res = await saveCustomer({ name, phone, type });
    setSaving(false);
    if (res.ok) { toast('Customer registered'); onCreated(res.customer); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title="New customer"
      onClose={onClose}
      maxWidth={420}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Register'}</button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="field-label">Name</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nimal Perera / ABC Supplements" />
        </div>
        <div>
          <label className="field-label">Phone</label>
          <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="077 123 4567" />
        </div>
        <div className="flex gap-2">
          <button className="chip" data-active={type === 'RETAIL' || undefined} onClick={() => setType('RETAIL')}>Customer</button>
          <button className="chip" data-active={type === 'SHOP' || undefined} onClick={() => setType('SHOP')}>Shop (bulk buyer)</button>
        </div>
      </div>
    </Modal>
  );
}
