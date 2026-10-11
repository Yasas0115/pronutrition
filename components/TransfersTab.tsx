'use client';

import { fmt } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { transferLabel, type TransferRow } from '@/lib/transfer-types';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// A printable hand-over note to travel with the goods.
function printTransfer(t: TransferRow, storeName: string) {
  const w = window.open('', 'transfer', 'width=820,height=900');
  if (!w) return;
  const units = t.lines.reduce((n, l) => n + l.qty, 0);
  const rows = t.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.productName)}</td><td class="r">${fmt(l.qty)}</td>` +
        `<td class="r">${fmt(l.fromBefore)} → ${fmt(l.fromAfter)}</td><td class="r">${fmt(l.toBefore)} → ${fmt(l.toAfter)}</td></tr>`,
    )
    .join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(transferLabel(t.number))}</title>
    <style>
      *{font-family:'Segoe UI',system-ui,sans-serif;box-sizing:border-box}
      body{margin:24px;color:#000;font-size:13px}
      h1{margin:0;font-size:22px} .m{color:#555}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left} th{font-size:11px;text-transform:uppercase;color:#555}
      .r{text-align:right;white-space:nowrap}
      .sign{display:flex;gap:40px;margin-top:48px} .sign div{flex:1;border-top:1px solid #000;padding-top:6px;font-size:12px;color:#555}
    </style></head><body>
    <h1>${esc(storeName)}</h1>
    <div class="m">Stock transfer note</div>
    <h2 style="margin:14px 0 4px">${esc(transferLabel(t.number))}</h2>
    <div>${esc(t.fromBranchName)} → <b>${esc(t.toBranchName)}</b></div>
    <div class="m">${esc(fmtDateTime(t.createdAt))} · sent by ${esc(t.userName ?? '—')}${t.note ? ` · ${esc(t.note)}` : ''}</div>
    <table><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">${esc(t.fromBranchName)} (before → after)</th><th class="r">${esc(t.toBranchName)} (before → after)</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td><b>${t.lines.length} product${t.lines.length === 1 ? '' : 's'}</b></td><td class="r"><b>${fmt(units)}</b></td><td></td><td></td></tr></tfoot></table>
    <div class="sign"><div>Sent by</div><div>Received by</div></div>
    </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 250);
}

export default function TransfersTab({ transfers, storeName }: { transfers: TransferRow[]; storeName: string }) {
  if (transfers.length === 0) {
    return (
      <div className="card p-10 text-center" style={{ color: 'var(--color-faint)' }}>
        No transfers yet. Use <b>⇄ Transfer</b> to move stock between branches.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {transfers.map((t) => {
        const units = t.lines.reduce((n, l) => n + l.qty, 0);
        return (
          <div key={t.id} className="card overflow-hidden">
            <div className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--color-line)' }}>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="brand" style={{ fontSize: 17 }}>{transferLabel(t.number)}</span>
                  <span className="text-strong font-semibold text-[14px]">
                    {t.fromBranchName} <span style={{ color: 'var(--color-faint)' }}>→</span> {t.toBranchName}
                  </span>
                </div>
                <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                  {fmtDateTime(t.createdAt)} · {t.userName ?? '—'} · {t.lines.length} product{t.lines.length === 1 ? '' : 's'}, {fmt(units)} unit{units === 1 ? '' : 's'}
                  {t.note ? ` · ${t.note}` : ''}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => printTransfer(t, storeName)}>Print note</button>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-center">Qty</th>
                    <th className="text-right">{t.fromBranchName}</th>
                    <th className="text-right">{t.toBranchName}</th>
                  </tr>
                </thead>
                <tbody>
                  {t.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="text-strong">{l.productName}</td>
                      <td className="text-center num font-semibold">{fmt(l.qty)}</td>
                      <td className="text-right num whitespace-nowrap">
                        <span style={{ color: 'var(--color-muted)' }}>{fmt(l.fromBefore)}</span> → <b>{fmt(l.fromAfter)}</b>
                        <span className="ml-2 font-semibold" style={{ color: 'var(--color-brand)' }}>−{fmt(l.qty)}</span>
                      </td>
                      <td className="text-right num whitespace-nowrap">
                        <span style={{ color: 'var(--color-muted)' }}>{fmt(l.toBefore)}</span> → <b>{fmt(l.toAfter)}</b>
                        <span className="ml-2 font-semibold" style={{ color: 'var(--color-ok)' }}>+{fmt(l.qty)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
