'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, fmt, parseAmount } from '@/lib/money';
import { fmtDateTime, todayStr } from '@/lib/dates';
import { SETTLEMENT_METHODS } from '@/lib/payment-methods';
import type { ReceivableRow } from '@/lib/receivables';
import { getCustomerLedger, receiveCustomerPayment, type CustomerLedger } from '@/app/customers/actions';
import Modal from '../Modal';
import { toast } from '../toast';

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

type Opened = { id: string; name: string; due: number };

// Who owes what, aged by how old each unpaid sale is. A customer's row opens
// their ledger, where a payment can be received and a statement printed.
export default function ReceivablesView({
  rows,
  currency,
  storeName,
  scopeLabel,
  methodLabels,
  initialCustomer,
}: {
  rows: ReceivableRow[];
  currency: string;
  storeName: string;
  scopeLabel: string;
  methodLabels: Record<string, string>;
  /** Opens this customer's ledger straight away (the Customers page links here). */
  initialCustomer: Opened | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Opened | null>(initialCustomer);
  const sum = (f: (r: ReceivableRow) => number) => rows.reduce((n, r) => n + f(r), 0);

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">Receivables</h1>
        <p className="page-sub">
          What customers still owe for <b style={{ color: 'var(--color-strong)' }}>{scopeLabel}</b> · click a customer to
          see their ledger and receive a payment.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Total outstanding</div>
          <div className="stat__value" style={{ color: rows.length ? 'var(--color-warn)' : undefined }}>{money(sum((r) => r.due), currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Customers owing</div>
          <div className="stat__value">{rows.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Over 30 days</div>
          <div className="stat__value">{money(sum((r) => r.b30 + r.b60 + r.b90), currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Over 90 days</div>
          <div className="stat__value" style={{ color: sum((r) => r.b90) ? 'var(--color-brand)' : undefined }}>{money(sum((r) => r.b90), currency)}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="text-center">Unpaid sales</th>
                <th className="text-right">0–30 days</th>
                <th className="text-right">31–60</th>
                <th className="text-right">61–90</th>
                <th className="text-right">90+</th>
                <th className="text-right">Total owed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>Nobody owes anything right now.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.key}
                    className={r.customerId ? 'cursor-pointer' : undefined}
                    onClick={() => r.customerId && setOpen({ id: r.customerId, name: r.name, due: r.due })}
                  >
                    <td>
                      <div className="text-strong font-semibold">{r.name}</div>
                      <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                        oldest {daysSince(r.oldestAt)} day{daysSince(r.oldestAt) === 1 ? '' : 's'} · since {fmtDateTime(r.oldestAt)}
                      </div>
                    </td>
                    <td className="text-center num">{r.count}</td>
                    <td className="text-right num whitespace-nowrap">{r.b0 ? money(r.b0, currency) : '—'}</td>
                    <td className="text-right num whitespace-nowrap">{r.b30 ? money(r.b30, currency) : '—'}</td>
                    <td className="text-right num whitespace-nowrap">{r.b60 ? money(r.b60, currency) : '—'}</td>
                    <td className="text-right num whitespace-nowrap" style={{ color: r.b90 ? 'var(--color-brand)' : undefined }}>{r.b90 ? money(r.b90, currency) : '—'}</td>
                    <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(r.due, currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="text-strong font-semibold">Total</td>
                  <td className="text-center num text-strong font-semibold">{sum((r) => r.count)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.b0), currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.b30), currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.b60), currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.b90), currency)}</td>
                  <td className="text-right num whitespace-nowrap text-strong font-semibold">{money(sum((r) => r.due), currency)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {open && (
        <LedgerModal
          row={open}
          currency={currency}
          storeName={storeName}
          methodLabels={methodLabels}
          onClose={() => setOpen(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}

// ---------- Ledger + receive payment ----------
function LedgerModal({
  row,
  currency,
  storeName,
  methodLabels,
  onClose,
  onChanged,
}: {
  row: Opened;
  currency: string;
  storeName: string;
  methodLabels: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [ledger, setLedger] = useState<CustomerLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let alive = true;
    getCustomerLedger(row.id).then((res) => {
      if (!alive) return;
      if (res.ok) { setLedger(res.ledger); setError(null); }
      else setError(res.error);
    });
    return () => { alive = false; };
  }, [row.id, reload]);

  const due = ledger?.totalDue ?? row.due;

  function printStatement() {
    if (!ledger) return;
    const w = window.open('', 'statement', 'width=820,height=900');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
    const saleRows = ledger.sales
      .map((s) => `<tr><td>#${s.number}</td><td>${fmtDateTime(s.createdAt)}</td><td>${esc(methodLabels[s.method] ?? s.method)}${s.saleType === 'WHOLESALE' ? ' · wholesale' : ''}</td><td class="r">${money(s.total, currency)}</td><td class="r">${money(s.paid, currency)}</td><td class="r">${s.balanceDue > 0 ? money(s.balanceDue, currency) : '—'}</td></tr>`)
      .join('');
    const payRows = ledger.payments
      .filter((p) => p.kind === 'SETTLEMENT')
      .map((p) => `<tr><td>${fmtDateTime(p.createdAt)}</td><td>Invoice #${p.saleNumber}</td><td>${esc(methodLabels[p.method] ?? p.method)}</td><td class="r">${money(p.amount, currency)}</td><td>${esc(p.userName ?? '')}</td></tr>`)
      .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Statement — ${esc(ledger.customer.name)}</title>
      <style>
        *{font-family:'Segoe UI',system-ui,sans-serif;box-sizing:border-box}
        body{margin:24px;color:#000;font-size:13px}
        h1{margin:0;font-size:22px} h2{font-size:15px;margin:22px 0 6px}
        .m{color:#555} table{width:100%;border-collapse:collapse}
        th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left} th{font-size:11px;text-transform:uppercase;color:#555}
        .r{text-align:right;white-space:nowrap} .due{font-size:18px;font-weight:700;margin-top:14px}
      </style></head><body>
      <h1>${esc(storeName)}</h1>
      <div class="m">Customer statement · ${todayStr()}</div>
      <h2>${esc(ledger.customer.name)}</h2>
      <div class="m">${esc([ledger.customer.phone, ledger.customer.address].filter(Boolean).join(' · '))}</div>
      <div class="due">Balance due: ${money(ledger.totalDue, currency)}</div>
      <h2>Sales</h2>
      <table><thead><tr><th>Invoice</th><th>Date</th><th>Paid by</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Due</th></tr></thead><tbody>${saleRows || '<tr><td colspan="6">No sales.</td></tr>'}</tbody></table>
      <h2>Payments received</h2>
      <table><thead><tr><th>When</th><th>Applied to</th><th>Method</th><th class="r">Amount</th><th>Received by</th></tr></thead><tbody>${payRows || '<tr><td colspan="5">No payments yet.</td></tr>'}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  }

  const settlements = ledger?.payments.filter((p) => p.kind === 'SETTLEMENT') ?? [];

  return (
    <>
      <Modal
        title={row.name}
        onClose={onClose}
        maxWidth={760}
        footer={
          <>
            <button className="btn btn-ghost" onClick={printStatement} disabled={!ledger}>Print statement</button>
            {due > 0 && <button className="btn btn-primary" onClick={() => setPaying(true)}>Receive payment</button>}
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </>
        }
      >
        {error ? (
          <div className="text-[13.5px]" style={{ color: 'var(--color-brand)' }}>{error}</div>
        ) : !ledger ? (
          <div className="text-center py-10" style={{ color: 'var(--color-faint)' }}>Loading…</div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="stat">
                <div className="stat__label">Owes now</div>
                <div className="stat__value" style={{ color: due > 0 ? 'var(--color-warn)' : undefined }}>{money(due, currency)}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Total bought</div>
                <div className="stat__value">{money(ledger.totalSales, currency)}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Sales</div>
                <div className="stat__value">{ledger.sales.length}</div>
              </div>
            </div>

            <div className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
              {[ledger.customer.type === 'SHOP' ? 'Shop' : 'Customer', ledger.customer.phone, ledger.customer.address].filter(Boolean).join(' · ')}
            </div>

            <div>
              <div className="brand mb-2" style={{ fontSize: 16 }}>Sales</div>
              <div className="card overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr><th>Invoice</th><th>When</th><th>Method</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Due</th></tr>
                  </thead>
                  <tbody>
                    {ledger.sales.length === 0 ? (
                      <tr><td colSpan={6} className="text-center" style={{ color: 'var(--color-faint)', padding: 24 }}>No sales yet.</td></tr>
                    ) : (
                      ledger.sales.map((s) => (
                        <tr key={s.id}>
                          <td className="num text-strong font-semibold">#{s.number}</td>
                          <td className="text-[12.5px] whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>{fmtDateTime(s.createdAt)}</td>
                          <td className="text-[12.5px]">
                            {methodLabels[s.method] ?? s.method}{s.saleType === 'WHOLESALE' && <span style={{ color: 'var(--color-muted)' }}> · wholesale</span>}
                          </td>
                          <td className="text-right num">{money(s.total, currency)}</td>
                          <td className="text-right num">{money(s.paid, currency)}</td>
                          <td className="text-right num font-semibold" style={{ color: s.balanceDue > 0 ? 'var(--color-warn)' : 'var(--color-faint)' }}>
                            {s.balanceDue > 0 ? money(s.balanceDue, currency) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="brand mb-2" style={{ fontSize: 16 }}>Payments received</div>
              <div className="card overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr><th>When</th><th>Applied to</th><th>Method</th><th className="text-right">Amount</th><th>By</th></tr>
                  </thead>
                  <tbody>
                    {settlements.length === 0 ? (
                      <tr><td colSpan={5} className="text-center" style={{ color: 'var(--color-faint)', padding: 24 }}>No credit payments received yet.</td></tr>
                    ) : (
                      settlements.map((p) => (
                        <tr key={p.id}>
                          <td className="text-[12.5px] whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>{fmtDateTime(p.createdAt)}</td>
                          <td className="num">Invoice #{p.saleNumber}</td>
                          <td className="text-[12.5px]">{methodLabels[p.method] ?? p.method}</td>
                          <td className="text-right num font-semibold" style={{ color: 'var(--color-ok)' }}>{money(p.amount, currency)}</td>
                          <td className="text-[12.5px]" style={{ color: 'var(--color-muted)' }}>{p.userName || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {paying && ledger && (
        <ReceivePaymentModal
          customerId={row.id}
          customerName={row.name}
          due={ledger.totalDue}
          currency={currency}
          methodLabels={methodLabels}
          onClose={() => setPaying(false)}
          onDone={() => { setPaying(false); setReload((n) => n + 1); onChanged(); }}
        />
      )}
    </>
  );
}

function ReceivePaymentModal({
  customerId,
  customerName,
  due,
  currency,
  methodLabels,
  onClose,
  onDone,
}: {
  customerId: string;
  customerName: string;
  due: number;
  currency: string;
  methodLabels: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<string>(SETTLEMENT_METHODS[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const over = amount > due;
  const remaining = Math.max(0, due - amount);

  async function save() {
    if (amount <= 0) { toast('Enter the amount received.', true); return; }
    if (over) { toast(`${customerName} only owes ${money(due, currency)}.`, true); return; }
    setSaving(true);
    const res = await receiveCustomerPayment({ customerId, amount, method, note });
    setSaving(false);
    if (res.ok) {
      toast(
        res.remainingDue > 0
          ? `Received ${money(res.applied, currency)} — ${money(res.remainingDue, currency)} still owed`
          : `Received ${money(res.applied, currency)} — account cleared`,
      );
      onDone();
    } else {
      toast(res.error, true);
    }
  }

  return (
    <Modal
      title="Receive payment"
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || amount <= 0 || over}>
            {saving ? 'Saving…' : `Receive ${amount > 0 ? money(amount, currency) : ''}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-strong font-semibold">{customerName}</div>
          <div className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
            Owes <b className="num" style={{ color: 'var(--color-warn)' }}>{money(due, currency)}</b> · payments are applied to the oldest unpaid sales first.
          </div>
        </div>

        <div>
          <label className="field-label">Amount received ({currency})</label>
          <input
            className="input num"
            inputMode="numeric"
            autoFocus
            value={amount ? String(amount) : ''}
            placeholder="0"
            onChange={(e) => setAmount(parseAmount(e.target.value))}
          />
          <div className="mt-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setAmount(due)}>Full balance ({fmt(due)})</button>
          </div>
        </div>

        <div>
          <label className="field-label">Received by</label>
          <div className="flex gap-2">
            {SETTLEMENT_METHODS.map((k) => (
              <button key={k} className="chip" data-active={method === k || undefined} onClick={() => setMethod(k)}>
                {methodLabels[k] ?? k}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label">Note (optional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bank slip no." />
        </div>

        <div className="summary-row">
          <span style={{ color: over ? 'var(--color-brand)' : 'var(--color-muted)' }}>
            {over ? 'More than is owed' : 'Still owed after this'}
          </span>
          <span className="num" style={{ color: over ? 'var(--color-brand)' : 'var(--color-strong)' }}>
            {money(over ? amount - due : remaining, currency)}
          </span>
        </div>
      </div>
    </Modal>
  );
}
