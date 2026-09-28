'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './toast';
import { parseAmount } from '@/lib/money';
import { saveStore, savePaymentMethods } from '@/app/settings/actions';

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
}: {
  store: Store;
  paymentMethods: PaymentMethod[];
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<PaymentMethod[]>(paymentMethods);
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
            Each method applies its discount automatically at checkout.
          </p>
          {methods.map((m, i) => (
            <div key={m.key} className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <label className="field-label">{m.key}</label>
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
            </div>
          ))}
          <div className="flex justify-end mt-1">
            <button className="btn btn-primary btn-sm" onClick={savePayments} disabled={savingMethods}>
              {savingMethods ? 'Saving…' : 'Save payment methods'}
            </button>
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
