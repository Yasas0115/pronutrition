'use client';

import Modal from './Modal';
import { money } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import type { Receipt } from '@/app/actions';
import { useT } from '@/components/I18nProvider';

export default function ReceiptModal({
  receipt,
  currency,
  store,
  onClose,
  closeLabel = 'New sale',
}: {
  receipt: Receipt;
  currency: string;
  store: { name: string; phone: string | null; address: string | null; note: string | null };
  onClose: () => void;
  /** Text of the dismiss button — "New sale" at the till, "Close" when re-opening an old receipt. */
  closeLabel?: string;
}) {
  const t = useT();
  const print = () => {
    const w = window.open('', 'receipt', 'width=380,height=640');
    if (!w) return;
    const rows = receipt.items
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.name)}<div class="m">${i.qty} × ${money(i.price, currency)}</div></td><td class="r">${money(i.lineTotal, currency)}</td></tr>`,
      )
      .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${t("Receipt #{0}", [receipt.number])}</title>
      <style>
        *{font-family:'Segoe UI',system-ui,sans-serif;box-sizing:border-box}
        body{width:300px;margin:0 auto;padding:14px;color:#000}
        h1{font-size:18px;text-align:center;margin:0;letter-spacing:1px}
        .c{text-align:center;font-size:11px;color:#333}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
        td{padding:3px 0;vertical-align:top}
        .r{text-align:right;white-space:nowrap}
        .m{font-size:10px;color:#666}
        hr{border:0;border-top:1px dashed #999;margin:8px 0}
        .row{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}
        .tot{font-weight:700;font-size:15px}
        .foot{text-align:center;font-size:11px;margin-top:10px;color:#333}
      </style></head><body>
      <h1>${escapeHtml(store.name)}</h1>
      ${receipt.branchName ? `<div class="c"><b>${escapeHtml(receipt.branchName)}</b></div>` : ''}
      ${store.address ? `<div class="c">${escapeHtml(store.address)}</div>` : ''}
      ${store.phone ? `<div class="c">${escapeHtml(store.phone)}</div>` : ''}
      <hr>
      ${receipt.saleType === 'WHOLESALE' ? `<div class="c"><b>${t("WHOLESALE INVOICE")}</b></div>` : ''}
      <div class="row"><span>${t("Receipt #{0}", [receipt.number])}</span><span>${fmtDateTime(receipt.createdAt)}</span></div>
      <div class="row"><span>${t("Cashier: {0}", [escapeHtml(receipt.cashierName ?? '')])}</span></div>
      ${receipt.customerName ? `<div class="row"><span>${t("Customer: {0}", [escapeHtml(receipt.customerName)])}</span></div>` : ''}
      <hr>
      <table>${rows}</table>
      <hr>
      <div class="row"><span>${t("Subtotal")}</span><span>${money(receipt.subtotal, currency)}</span></div>
      ${receipt.discount ? `<div class="row"><span>${t("Discount")}</span><span>- ${money(receipt.discount, currency)}</span></div>` : ''}
      ${receipt.tax ? `<div class="row"><span>${t("Tax")}</span><span>${money(receipt.tax, currency)}</span></div>` : ''}
      <div class="row tot"><span>${t("TOTAL")}</span><span>${money(receipt.total, currency)}</span></div>
      <div class="row"><span>${receipt.balanceDue > 0 ? t('Paid now') : receipt.method === 'SPLIT' ? t('Paid (split)') : t(receipt.method)}</span><span>${money(receipt.paid, currency)}</span></div>
      ${receipt.change ? `<div class="row"><span>${t("Change")}</span><span>${money(receipt.change, currency)}</span></div>` : ''}
      ${receipt.balanceDue > 0 ? `<div class="row tot"><span>${t("BALANCE DUE")}</span><span>${money(receipt.balanceDue, currency)}</span></div>` : ''}
      ${store.note ? `<div class="foot">${escapeHtml(store.note)}</div>` : ''}
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  return (
    <Modal
      title={t("Receipt #{0}", [receipt.number])}
      onClose={onClose}
      maxWidth={420}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>{t(closeLabel)}</button>
          <button className="btn btn-primary" onClick={print}>{t("Print receipt")}</button>
        </>
      }
    >
      <div className="receipt">
        <div className="text-center">
          <div className="brand" style={{ fontSize: 24 }}>{store.name}</div>
          {receipt.branchName && <div className="text-[12.5px] text-strong font-semibold">{receipt.branchName}</div>}
          {store.address && <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{store.address}</div>}
          <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
            {fmtDateTime(receipt.createdAt)} · {receipt.cashierName}
          </div>
        </div>
        <hr className="receipt__hr" />
        {receipt.saleType === 'WHOLESALE' && (
          <div className="receipt__line"><span>{t("Sale type")}</span><b>{t("Wholesale invoice")}</b></div>
        )}
        {receipt.customerName && (
          <div className="receipt__line"><span>{t("Customer")}</span><span>{receipt.customerName}</span></div>
        )}
        {receipt.items.map((i, idx) => (
          <div className="receipt__line" key={idx}>
            <span>{i.name} <span style={{ color: 'var(--color-faint)' }}>× {i.qty}</span></span>
            <span className="num">{money(i.lineTotal, currency)}</span>
          </div>
        ))}
        <hr className="receipt__hr" />
        <div className="receipt__line"><span>{t("Subtotal")}</span><span className="num">{money(receipt.subtotal, currency)}</span></div>
        {receipt.discount > 0 && (
          <div className="receipt__line"><span>{t("Discount")}</span><span className="num">− {money(receipt.discount, currency)}</span></div>
        )}
        {receipt.tax > 0 && (
          <div className="receipt__line"><span>{t("Tax")}</span><span className="num">{money(receipt.tax, currency)}</span></div>
        )}
        <div className="receipt__line" style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, color: 'var(--color-strong)', marginTop: 4 }}>
          <span>{t("TOTAL")}</span><span className="num" style={{ color: 'var(--color-brand)' }}>{money(receipt.total, currency)}</span>
        </div>
        <hr className="receipt__hr" />
        <div className="receipt__line">
          <span>{receipt.balanceDue > 0 ? t("Paid now") : t("Paid ({0})", [receipt.method === 'SPLIT' ? 'split' : receipt.method])}</span>
          <span className="num">{money(receipt.paid, currency)}</span>
        </div>
        {receipt.change > 0 && (
          <div className="receipt__line" style={{ color: 'var(--color-ok)' }}><span>{t("Change")}</span><span className="num">{money(receipt.change, currency)}</span></div>
        )}
        {receipt.balanceDue > 0 && (
          <div className="receipt__line" style={{ color: 'var(--color-warn)', fontWeight: 700 }}>
            <span>{t("Balance due")}</span><span className="num">{money(receipt.balanceDue, currency)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}
