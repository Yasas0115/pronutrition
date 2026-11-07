'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './toast';
import { parseAmount } from '@/lib/money';
import {
  saveStore, savePaymentMethods, addPaymentMethod, removePaymentMethod,
  addPromotion, setPromotionActive, removePromotion,
} from '@/app/settings/actions';

const CORE_METHODS = ['CASH', 'CARD', 'KOKO', 'BANK', 'CREDIT'];

type Promotion = {
  id: string; name: string; percent: number; startsOn: string | null; endsOn: string | null; active: boolean;
};

type Store = {
  name: string;
  currency: string;
  phone: string;
  address: string;
  receiptNote: string;
  taxPercent: number;
  logoUrl: string | null;
};

type PaymentMethod = { key: string; label: string; discountPercent: number };

export default function SettingsView({
  store,
  paymentMethods,
  promotions,
}: {
  store: Store;
  paymentMethods: PaymentMethod[];
  promotions: Promotion[];
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<PaymentMethod[]>(paymentMethods);
  // Re-sync with the server list after an add / remove refreshes the page.
  useEffect(() => { setMethods(paymentMethods); }, [paymentMethods]);

  // add-method form
  const [newLabel, setNewLabel] = useState('');
  const [newPct, setNewPct] = useState(0);
  const [newNeedsCustomer, setNewNeedsCustomer] = useState(false);
  // add-seasonal-discount form
  const [pName, setPName] = useState('');
  const [pPct, setPPct] = useState(0);
  const [pFrom, setPFrom] = useState('');
  const [pTo, setPTo] = useState('');
  const [busy, setBusy] = useState(false);

  // Run a server action, toast the outcome and refresh the page data.
  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) { toast(okMsg); router.refresh(); return true; }
      toast(res.error, true);
    } catch {
      toast('Something went wrong. Please try again.', true);
    } finally {
      setBusy(false);
    }
    return false;
  }
  const [savingMethods, setSavingMethods] = useState(false);

  async function savePayments() {
    setSavingMethods(true);
    try {
      const res = await savePaymentMethods(methods);
      if (res.ok) { toast('Payment methods saved'); router.refresh(); }
      else toast(res.error, true);
    } catch {
      toast('Could not save payment methods. Please try again.', true);
    } finally {
      setSavingMethods(false);
    }
  }
  const [name, setName] = useState(store.name);
  const [currency, setCurrency] = useState(store.currency);
  const [phone, setPhone] = useState(store.phone);
  const [address, setAddress] = useState(store.address);
  const [receiptNote, setReceiptNote] = useState(store.receiptNote);
  const [taxPercent, setTaxPercent] = useState(store.taxPercent);
  const [logoUrl, setLogoUrl] = useState<string | null>(store.logoUrl);
  const [logoTouched, setLogoTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Choose an image file.', true); return; }
    try {
      const dataUrl = await resizeImage(file, 320, 120);
      setLogoUrl(dataUrl);
      setLogoTouched(true);
    } catch {
      toast('Could not read that image.', true);
    }
  }

  function removeLogo() {
    setLogoUrl(null);
    setLogoTouched(true);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function save() {
    if (!name.trim()) { toast('Enter a store name.', true); return; }
    setSaving(true);
    try {
      const res = await saveStore({
        name, currency, phone, address, receiptNote, taxPercent,
        logoUrl: logoTouched ? logoUrl : undefined,
      });
      if (res.ok) { toast('Settings saved'); router.refresh(); }
      else toast(res.error, true);
    } catch {
      toast('Could not save settings. The logo image may be too large.', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Store identity, receipt details and tax.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Store identity */}
        <div className="card p-5 flex flex-col gap-4">
          <div className="brand" style={{ fontSize: 17 }}>Store</div>

          <div>
            <label className="field-label">Store name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Currency symbol</label>
              <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="Rs" />
            </div>
            <div>
              <label className="field-label">Tax / VAT (%)</label>
              <input className="input num" inputMode="numeric" value={String(taxPercent)} onChange={(e) => setTaxPercent(parseAmount(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="field-label">Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94 77 123 4567" />
          </div>

          <div>
            <label className="field-label">Address</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="No. 12, Galle Road, Colombo 03" />
          </div>
        </div>

        {/* Logo + receipt */}
        <div className="card p-5 flex flex-col gap-4">
          <div className="brand" style={{ fontSize: 17 }}>Branding &amp; receipt</div>

          <div>
            <label className="field-label">Store logo (shown in the header)</label>
            <div className="flex items-center gap-4 mt-1">
              <div className="flex items-center justify-center gap-2 rounded-lg shrink-0 px-3"
                style={{ minWidth: 120, height: 56, background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}>
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="logo" style={{ maxHeight: 44, maxWidth: 88, objectFit: 'contain' }} />
                )}
                <span className="brand" style={{ fontSize: 15 }}>{name || 'Pro Nutrition'}</span>
              </div>
              <div className="flex flex-col gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Upload image</button>
                {logoUrl && <button className="btn btn-danger btn-sm" onClick={removeLogo}>Remove</button>}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
              </div>
            </div>
          </div>

          <div>
            <label className="field-label">Receipt footer note</label>
            <textarea className="input" rows={3} value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} placeholder="Thank you — stay strong!" />
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <div className="grid gap-4 mt-4">
        {/* Payment methods */}
        <div className="card p-5 flex flex-col gap-3">
          <div className="brand" style={{ fontSize: 17 }}>Payment methods &amp; discounts</div>
          <p className="text-[13px]" style={{ color: 'var(--color-muted)', marginTop: -6 }}>
            Each method applies its discount automatically at retail checkout (not on wholesale sales).
            Walk-in customers can pay by Cash or Card only — Koko, Bank transfer and Credit need a registered customer.
          </p>
          {methods.map((m, i) => (
            <div key={m.key} className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
              <div>
                <label className="field-label">{CORE_METHODS.includes(m.key) ? m.key : 'Custom'}</label>
                <input
                  className="input"
                  value={m.label}
                  onChange={(e) => setMethods((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
              </div>
              <div style={{ width: 110 }}>
                <label className="field-label">Discount %</label>
                <input
                  className="input num"
                  inputMode="numeric"
                  value={String(m.discountPercent)}
                  onChange={(e) => setMethods((prev) => prev.map((x, j) => (j === i ? { ...x, discountPercent: parseAmount(e.target.value) } : x)))}
                />
              </div>
              {CORE_METHODS.includes(m.key) ? (
                <div style={{ width: 70 }} />
              ) : (
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Remove the "${m.label}" payment method? It will no longer appear at the till.`)) {
                      run(() => removePaymentMethod(m.key), 'Payment method removed');
                    }
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className="flex justify-end mt-1">
            <button className="btn btn-primary btn-sm" onClick={savePayments} disabled={savingMethods}>
              {savingMethods ? 'Saving…' : 'Save payment methods'}
            </button>
          </div>

          {/* Add a payment method */}
          <div className="pt-3 mt-1 flex flex-col gap-3" style={{ borderTop: '1px solid var(--color-line-2)' }}>
            <div className="field-label">Add a payment method</div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <label className="field-label">Name</label>
                <input className="input" value={newLabel} placeholder="e.g. Gift voucher" onChange={(e) => setNewLabel(e.target.value)} />
              </div>
              <div style={{ width: 110 }}>
                <label className="field-label">Discount %</label>
                <input className="input num" inputMode="numeric" value={String(newPct)} onChange={(e) => setNewPct(parseAmount(e.target.value))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={newNeedsCustomer} onChange={(e) => setNewNeedsCustomer(e.target.checked)} />
              Needs a registered customer (walk-ins can&apos;t use it)
            </label>
            <div className="flex justify-end">
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={async () => {
                  const ok = await run(
                    () => addPaymentMethod({ label: newLabel, discountPercent: newPct, requiresCustomer: newNeedsCustomer }),
                    'Payment method added',
                  );
                  if (ok) { setNewLabel(''); setNewPct(0); setNewNeedsCustomer(false); }
                }}
              >
                + Add payment method
              </button>
            </div>
          </div>
        </div>

        {/* Seasonal discounts */}
        <div className="card p-5 flex flex-col gap-3">
          <div className="brand" style={{ fontSize: 17 }}>Seasonal discounts</div>
          <p className="text-[13px]" style={{ color: 'var(--color-muted)', marginTop: -6 }}>
            A seasonal discount is applied automatically at the till on every retail sale while it is switched on and
            today is inside its dates. It adds to the payment-method discount (e.g. Cash 10% + Avurudu 5% = 15% off).
            Not applied to wholesale sales.
          </p>
          {promotions.length === 0 && (
            <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>No seasonal discounts yet.</p>
          )}
          {promotions.map((p) => {
            const window = p.startsOn || p.endsOn
              ? `${p.startsOn ?? 'now'} → ${p.endsOn ?? 'until switched off'}`
              : 'No dates — runs until switched off';
            return (
              <div key={p.id} className="flex items-center gap-3 flex-wrap rounded-lg px-3 py-2"
                style={{ background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)', opacity: p.active ? 1 : 0.6 }}>
                <div className="flex-1" style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>{p.name} — {p.percent}% off</div>
                  <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{window}</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => run(() => setPromotionActive(p.id, !p.active), p.active ? 'Switched off' : 'Switched on')}
                >
                  {p.active ? 'Switch off' : 'Switch on'}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Remove the "${p.name}" seasonal discount?`)) run(() => removePromotion(p.id), 'Seasonal discount removed');
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}

          <div className="pt-3 mt-1 flex flex-col gap-3" style={{ borderTop: '1px solid var(--color-line-2)' }}>
            <div className="field-label">Add a seasonal discount</div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <label className="field-label">Name</label>
                <input className="input" value={pName} placeholder="e.g. Avurudu sale" onChange={(e) => setPName(e.target.value)} />
              </div>
              <div style={{ width: 110 }}>
                <label className="field-label">Discount %</label>
                <input className="input num" inputMode="numeric" value={String(pPct)} onChange={(e) => setPPct(parseAmount(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">From (optional)</label>
                <input className="input" type="date" value={pFrom} onChange={(e) => setPFrom(e.target.value)} />
              </div>
              <div>
                <label className="field-label">To (optional)</label>
                <input className="input" type="date" value={pTo} onChange={(e) => setPTo(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={async () => {
                  const ok = await run(
                    () => addPromotion({ name: pName, percent: pPct, startsOn: pFrom, endsOn: pTo }),
                    'Seasonal discount added',
                  );
                  if (ok) { setPName(''); setPPct(0); setPFrom(''); setPTo(''); }
                }}
              >
                + Add seasonal discount
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Resize an uploaded image to fit within maxW×maxH and return a compact
// data: URL (PNG) so it can live in the single Store row.
function resizeImage(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no ctx'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
