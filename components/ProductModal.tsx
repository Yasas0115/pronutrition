'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { toast } from './toast';
import { parseAmount } from '@/lib/money';
import { saveProduct, deleteProduct, getProductGallery } from '@/app/(app)/products/actions';
import { useT } from '@/components/I18nProvider';

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  flavor: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  imageUrl: string | null;
  // How many photos the product has. The photos themselves are loaded when the
  // edit window opens, so the product list stays light.
  imageCount: number;
  stock: number;
  lowStockAt: number;
  active: boolean;
};

export default function ProductModal({
  product,
  categories,
  branchLabel,
  stockEditable = true,
  canSeeCost = false,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  categories: string[];
  branchLabel: string;
  stockEditable?: boolean;
  // Buying price is accountant-level: the field only exists for the owner and
  // `finance` users. Everyone else never receives the value.
  canSeeCost?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const editing = !!product;
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(
    product?.category ?? categories[0] ?? 'Uncategorized',
  );
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [flavor, setFlavor] = useState(product?.flavor ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [price, setPrice] = useState(product?.price ?? 0);
  // Buying price: editable here only for finance users. For anyone else this is
  // just a placeholder — the server ignores it and keeps the stored cost.
  const [cost, setCost] = useState(product?.cost ?? 0);
  const [stock, setStock] = useState(product?.stock ?? 0);
  const [lowStockAt, setLowStockAt] = useState(product?.lowStockAt ?? 5);
  const [active, setActive] = useState(product?.active ?? true);
  // Photos are fetched when the window opens (the product list only carries a
  // count), so the list page stays small.
  const [images, setImages] = useState<string[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(!!product && product.imageCount > 0);
  const [imagesTouched, setImagesTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGES = 8;

  useEffect(() => {
    if (!product || product.imageCount === 0) return;
    let live = true;
    getProductGallery(product.id)
      .then((loaded) => { if (live) setImages((prev) => [...loaded, ...prev]); })
      .catch(() => { if (live) toast(t("Could not load the photos."), true); })
      .finally(() => { if (live) setGalleryLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Accept one or many files; resize each and append to the gallery.
  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = ''; // allow re-picking same file
    if (!files.length || galleryLoading) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { toast(t("Up to {0} photos.", [MAX_IMAGES]), true); return; }
    const picked = files.slice(0, room);
    try {
      const resized = await Promise.all(
        picked
          .filter((f) => f.type.startsWith('image/'))
          .map((f) => resizeImage(f, 400, 400)),
      );
      if (!resized.length) { toast(t("Choose image files."), true); return; }
      setImages((prev) => [...prev, ...resized]);
      setImagesTouched(true);
      if (files.length > room) toast(t("Added {0} — max {1} photos.", [room, MAX_IMAGES]), true);
    } catch {
      toast(t("Could not read that image."), true);
    }
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagesTouched(true);
  }

  // Promote a photo to the cover (first slot) — that's what the POS grid shows.
  function makeCover(idx: number) {
    if (idx === 0) return;
    setImages((prev) => {
      const next = [...prev];
      const [pick] = next.splice(idx, 1);
      next.unshift(pick);
      return next;
    });
    setImagesTouched(true);
  }

  // Offer the managed categories, always including this product's current one.
  const catOptions = Array.from(
    new Set([...categories, category].filter(Boolean)),
  ).sort();

  async function save() {
    if (!name.trim()) { toast(t("Enter a product name."), true); return; }
    setSaving(true);
    const res = await saveProduct({
      id: product?.id,
      name, category, brand, flavor, sku, barcode,
      price, cost, stock, lowStockAt, active,
      images: imagesTouched ? images : undefined,
    });
    setSaving(false);
    if (res.ok) {
      toast(editing ? t("Product updated") : t("Product added"));
      onSaved();
    } else {
      toast(res.error, true);
    }
  }

  async function remove() {
    setSaving(true);
    const res = await deleteProduct(product!.id);
    setSaving(false);
    if (res.ok) {
      toast(t("Product removed"));
      onSaved();
    } else {
      toast(res.error, true);
    }
  }

  return (
    <Modal
      title={editing ? t("Edit product") : t("New product")}
      onClose={onClose}
      maxWidth={560}
      footer={
        <>
          {editing && (
            <button
              className="btn btn-danger mr-auto"
              onClick={() => (confirmDel ? remove() : setConfirmDel(true))}
              disabled={saving}
            >
              {confirmDel ? t("Confirm delete") : t("Delete")}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>{t("Cancel")}</button>
          <button className="btn btn-primary" onClick={save} aria-busy={saving} disabled={saving}>
            {saving ? t("Saving…") : editing ? t("Save changes") : t("Add product")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Product photos — gallery, shared across all branches. The first
            photo is the cover shown on the POS grid and product list. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="field-label" style={{ margin: 0 }}>
              {t("Product photos")}{' '}{images.length > 0 && <span style={{ color: 'var(--color-faint)' }}>· {images.length}/{MAX_IMAGES}</span>}
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
            >
              {t("+ Add photos")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {images.map((src, i) => (
              <div
                key={i}
                className="relative rounded-lg overflow-hidden group"
                style={{ width: 72, height: 72, background: 'var(--color-ink-1)', border: `1px solid ${i === 0 ? 'var(--color-brand)' : 'var(--color-line-2)'}` }}
                title={i === 0 ? t("Cover photo") : t("Click to make cover")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  onClick={() => makeCover(i)}
                  style={{ width: 72, height: 72, objectFit: 'cover', cursor: i === 0 ? 'default' : 'pointer' }}
                />
                {i === 0 && (
                  <span
                    className="absolute bottom-0 left-0 right-0 text-center"
                    style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', background: 'var(--color-brand)', padding: '1px 0' }}
                  >
                    {t("Cover")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label={t("Remove photo")}
                  className="absolute top-1 right-1 grid place-items-center rounded-full"
                  style={{ width: 18, height: 18, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 12, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
            {images.length === 0 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="grid place-items-center rounded-lg"
                style={{ width: 72, height: 72, background: 'var(--color-ink-1)', border: '1px dashed var(--color-line-2)', fontSize: 11, color: 'var(--color-faint)' }}
              >
                {t("No photos")}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onImage} />
        </div>

        <div>
          <label className="field-label">{t("Product name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Gold Standard 100% Whey 2lb")} autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t("Category")}</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {categories.length === 0 && (
              <p className="text-[12px] mt-1" style={{ color: 'var(--color-faint)' }}>
                {t("No categories yet — add them under Store → Categories.")}
              </p>
            )}
          </div>
          <div>
            <label className="field-label">{t("Brand")}</label>
            <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t("Optimum Nutrition")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t("Flavor / variant")}</label>
            <input className="input" value={flavor} onChange={(e) => setFlavor(e.target.value)} placeholder={t("Double Rich Chocolate")} />
          </div>
          <div>
            <label className="field-label">{t("Barcode")}</label>
            <input className="input num" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="748927028669" />
          </div>
        </div>

        <div className={canSeeCost ? 'grid grid-cols-2 gap-3' : undefined}>
          <div>
            <label className="field-label">{t("Retail price (Rs)")}</label>
            <input className="input num" inputMode="numeric" value={price ? String(price) : ''} onChange={(e) => setPrice(parseAmount(e.target.value))} placeholder="0" />
          </div>
          {canSeeCost && (
            <div>
              <label className="field-label">{t("Buying price (Rs)")}</label>
              <input className="input num" inputMode="numeric" value={cost ? String(cost) : ''} onChange={(e) => setCost(parseAmount(e.target.value))} placeholder="0" />
            </div>
          )}
          {canSeeCost && (
            <p className="text-[12px] col-span-2" style={{ color: 'var(--color-muted)', marginTop: -4 }}>
              {t("Price changes are recorded with your name and the time — see Accounting › Stock value › Price history.")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">{t("Stock · {0}", [branchLabel])}</label>
            <input className="input num" inputMode="numeric" value={String(stock)} disabled={!stockEditable} title={stockEditable ? undefined : t("Select a single branch to edit stock")} onChange={(e) => setStock(parseAmount(e.target.value))} />
          </div>
          <div>
            <label className="field-label">{t("Low-stock at")}</label>
            <input className="input num" inputMode="numeric" value={String(lowStockAt)} disabled={!stockEditable} onChange={(e) => setLowStockAt(parseAmount(e.target.value))} />
          </div>
          <div>
            <label className="field-label">{t("SKU")}</label>
            <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder={t("PN-1001")} />
          </div>
        </div>
        {!stockEditable && (
          <p className="text-[12px]" style={{ color: 'var(--color-muted)', marginTop: -8 }}>
            {t("Showing total stock across branches. Pick one branch (top bar) to edit its stock.")}
          </p>
        )}

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--color-brand)' }} />
          <span className="text-[14px]" style={{ color: 'var(--color-ash)' }}>{t("Active (available on the POS)")}</span>
        </label>
      </div>
    </Modal>
  );
}

// Resize an uploaded image to fit within maxW×maxH and return a compact
// JPEG data: URL so product photos stay small in the DB.
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
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
