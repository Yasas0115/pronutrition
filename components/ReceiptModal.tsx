'use client';

import Modal from './Modal';
import { money } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import type { Receipt } from '@/app/actions';

export default function ReceiptModal({
  receipt,
  currency,
  store,
  onClose,
}: {
  receipt: Receipt;
  currency: string;
  store: { name: string; phone: string | null; address: string | null; note: string | null };
  onClose: () => void;
}) {
  const print = () => {
    const w = window.open('', 'receipt', 'width=380,height=640');
    if (!w) return;
    const rows = receipt.items
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.name)}<div class="m">${i.qty} × ${money(i.price, currency)}</div></td><td class="r">${money(i.lineTotal, currency)}</td></tr>`,
      )
      .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt #${receipt.number}</title>
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
      <div class="row"><span>Receipt #${receipt.number}</span><span>${fmtDateTime(receipt.createdAt)}</span></div>
      <div class="row"><span>Cashier: ${escapeHtml(receipt.cashierName ?? '')}</span></div>
      ${receipt.customerName ? `<div class="row"><span>Customer: ${escapeHtml(receipt.customerName)}</span></div>` : ''}
      <hr>
      <table>${rows}</table>
      <hr>
      <div class="row"><span>Subtotal</span><span>${money(receipt.subtotal, currency)}</span></div>
      ${receipt.discount ? `<div class="row"><span>Discount</span><span>- ${money(receipt.discount, currency)}</span></div>` : ''}
      ${receipt.tax ? `<div class="row"><span>Tax</span><span>${money(receipt.tax, currency)}</span></div>` : ''}
      <div class="row tot"><span>TOTAL</span><span>${money(receipt.total, currency)}</span></div>
      <div class="row"><span>${receipt.method}</span><span>${money(receipt.paid, currency)}</span></div>
      ${receipt.change ? `<div class="row"><span>Change</span><span>${money(receipt.change, currency)}</span></div>` : ''}
      ${store.note ? `<div class="foot">${escapeHtml(store.note)}</div>` : ''}
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  return (
    <Modal
      title={`Receipt #${receipt.number}`}
      onClose={onClose}
      maxWidth={420}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>New sale</button>
          <button className="btn btn-primary" onClick={print}>Print receipt</button>
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
        {receipt.customerName && (
          <div className="receipt__line"><span>Customer</span><span>{receipt.customerName}</span></div>
        )}
        {receipt.items.map((i, idx) => (
          <div className="receipt__line" key={idx}>
            <span>{i.name} <span style={{ color: 'var(--color-faint)' }}>× {i.qty}</span></span>
            <span className="num">{money(i.lineTotal, currency)}</span>
          </div>
        ))}
        <hr className="receipt__hr" />
        <div className="receipt__line"><span>Subtotal</span><span className="num">{money(receipt.subtotal, currency)}</span></div>
        {receipt.discount > 0 && (
          <div className="receipt__line"><span>Discount</span><span className="num">− {money(receipt.discount, currency)}</span></div>
        )}
        {receipt.tax > 0 && (
          <div className="receipt__line"><span>Tax</span><span className="num">{money(receipt.tax, currency)}</span></div>
        )}
        <div className="receipt__line" style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, color: 'var(--color-strong)', marginTop: 4 }}>
          <span>TOTAL</span><span className="num" style={{ color: 'var(--color-brand)' }}>{money(receipt.total, currency)}</span>
        </div>
        <hr className="receipt__hr" />
        <div className="receipt__line"><span>Paid ({receipt.method})</span><span className="num">{money(receipt.paid, currency)}</span></div>
        {receipt.change > 0 && (
          <div className="receipt__line" style={{ color: 'var(--color-ok)' }}><span>Change</span><span className="num">{money(receipt.change, currency)}</span></div>
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
