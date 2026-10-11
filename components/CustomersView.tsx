'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, fmt, parseAmount } from '@/lib/money';
import { fmtDateTime, todayStr } from '@/lib/dates';
import Modal from './Modal';
import { toast } from './toast';
import {
  saveCustomer,
  setCustomerActive,
  getCustomerLedger,
  receiveCustomerPayment,
  type CustomerLedger,
} from '@/app/customers/actions';

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  type: 'RETAIL' | 'SHOP';
  active: boolean;
  totalBought: number;
  salesCount: number;
  lastPurchaseAt: string | null;
  due: number;
  oldestDueAt: string | null;
};

type Filter = 'all' | 'owing' | 'shops';

const METHODS = [
  { key: 'CASH', label: 'Cash' },
  { key: 'CARD', label: 'Card' },
  { key: 'BANK', label: 'Bank transfer' },
];

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export default function CustomersView({
  customers,
  currency,
  storeName,
}: {
  customers: CustomerRow[];
  currency: string;
  storeName: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<CustomerRow | null>(null);

  const totalDue = customers.reduce((n, c) => n + c.due, 0);
  const owingCount = customers.filter((c) => c.due > 0).length;
  const activeCount = customers.filter((c) => c.active).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter === 'owing' && c.due <= 0) return false;
      if (filter === 'shops' && c.type !== 'SHOP') return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q);
    });
  }, [customers, query, filter]);

  function refresh() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="page-title">Customers &amp; Credit</h1>
          <p className="page-sub">Registered customers and shops, what each one owes, and payments received.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Add customer</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Total owed to you</div>
          <div className="stat__value accent" style={{ color: totalDue ? 'var(--color-warn)' : undefined }}>{money(totalDue, currency)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Customers owing</div>
          <div className="stat__value">{owingCount}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Registered</div>
          <div className="stat__value">{activeCount}</div>
        </div>
      </div>

      <div className="mb-4">
        <input className="input" placeholder="Search name or phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex gap-2 mt-3">
          <button className="chip" data-active={filter === 'all' || undefined} onClick={() => setFilter('all')}>All</button>
          <button className="chip" data-active={filter === 'owing' || undefined} onClick={() => setFilter('owing')}>Owing ({owingCount})</button>
          <button className="chip" data-active={filter === 'shops' || undefined} onClick={() => setFilter('shops')}>Shops</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th className="text-right">Total bought</th>
                <th>Last purchase</th>
                <th className="text-right">Owes</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={6} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>No customers found.</td></tr>
              ) : (
                shown.map((c) => (
                  <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                    <td>
                      <button className="text-left" onClick={() => setLedgerFor(c)}>
                        <div className="text-strong font-semibold">{c.name}</div>
                        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                          {c.phone || 'No phone'}{!c.active && ' · inactive'}
                        </div>
                      </button>
                    </td>
                    <td>
                      <span className="badge" style={{ color: 'var(--color-muted)', background: 'var(--color-ink-1)' }}>
                        {c.type === 'SHOP' ? 'Shop' : 'Customer'}
                      </span>
                    </td>
                    <td className="text-right num">
                      {money(c.totalBought, currency)}
                      <div className="text-[11px]" style={{ color: 'var(--color-faint)' }}>{c.salesCount} sale{c.salesCount === 1 ? '' : 's'}</div>
                    </td>
                    <td className="text-[13px] whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>
                      {c.lastPurchaseAt ? fmtDateTime(c.lastPurchaseAt) : '—'}
                    </td>
                    <td className="text-right num font-semibold whitespace-nowrap" style={{ color: c.due > 0 ? 'var(--color-warn)' : 'var(--color-faint)' }}>
                      {c.due > 0 ? money(c.due, currency) : '—'}
                      {c.due > 0 && c.oldestDueAt && (
                        <div className="text-[11px] font-normal" style={{ color: 'var(--color-faint)' }}>
                          oldest {daysSince(c.oldestDueAt)} day{daysSince(c.oldestDueAt) === 1 ? '' : 's'}
                        </div>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-ghost btn-sm" onClick={() => setLedgerFor(c)}>Ledger</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <CustomerModal
          customer={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={refresh}
        />
      )}

      {ledgerFor && (
        <LedgerModal
          row={ledgerFor}
          currency={currency}
          storeName={storeName}
          onClose={() => setLedgerFor(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}

// ---------- Add / edit ----------
function CustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!customer;
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [type, setType] = useState<'RETAIL' | 'SHOP'>(customer?.type ?? 'RETAIL');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast('Enter the customer name.', true); return; }
    setSaving(true);
    const res = await saveCustomer({ id: customer?.id, name, phone, address, type, notes });
    setSaving(false);
    if (res.ok) { toast(editing ? 'Customer updated' : 'Customer registered'); onSaved(); }
    else toast(res.error, true);
  }

  async function toggleActive() {
    if (!customer) return;
    setSaving(true);
    const res = await setCustomerActive(customer.id, !customer.active);
    setSaving(false);
    if (res.ok) { toast(customer.active ? 'Customer deactivated' : 'Customer re-activated'); onSaved(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title={editing ? 'Edit customer' : 'Add customer'}
      onClose={onClose}
      maxWidth={500}
      footer={
        <>
          {editing && (
            <button className="btn btn-ghost mr-auto" onClick={toggleActive} disabled={saving}>
              {customer!.active ? 'Deactivate' : 'Re-activate'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <button className="chip" data-active={type === 'RETAIL' || undefined} onClick={() => setType('RETAIL')}>Customer</button>
          <button className="chip" data-active={type === 'SHOP' || undefined} onClick={() => setType('SHOP')}>Shop (bulk buyer)</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Name</label>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Phone</label>
            <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="field-label">Address</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ---------- Ledger + receive payment ----------
function LedgerModal({
  row,
  currency,
  storeName,
  onClose,
  onChanged,
}: {
  row: CustomerRow;
  currency: string;
  storeName: string;
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
      .map((s) => `<tr><td>#${s.number}</td><td>${fmtDateTime(s.createdAt)}</td><td>${esc(s.method)}${s.saleType === 'WHOLESALE' ? ' · wholesale' : ''}</td><td class="r">${money(s.total, currency)}</td><td class="r">${money(s.paid, currency)}</td><td class="r">${s.balanceDue > 0 ? money(s.balanceDue, currency) : '—'}</td></tr>`)
      .join('');
    const payRows = ledger.payments
      .filter((p) => p.kind === 'SETTLEMENT')
      .map((p) => `<tr><td>${fmtDateTime(p.createdAt)}</td><td>Invoice #${p.saleNumber}</td><td>${esc(p.method)}</td><td class="r">${money(p.amount, currency)}</td><td>${esc(p.userName ?? '')}</td></tr>`)
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
                            {s.method}{s.saleType === 'WHOLESALE' && <span style={{ color: 'var(--color-muted)' }}> · wholesale</span>}
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
                          <td className="text-[12.5px]">{p.method}</td>
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
  onClose,
  onDone,
}: {
  customerId: string;
  customerName: string;
  due: number;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('CASH');
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
            {METHODS.map((m) => (
              <button key={m.key} className="chip" data-active={method === m.key || undefined} onClick={() => setMethod(m.key)}>
                {m.label}
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
