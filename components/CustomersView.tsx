'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtDateTime } from '@/lib/dates';
import Modal from './Modal';
import { toast } from './toast';
import { saveCustomer, setCustomerActive } from '@/app/customers/actions';

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  type: 'RETAIL' | 'SHOP';
  active: boolean;
  salesCount: number;
  lastPurchaseAt: string | null;
};

type Filter = 'all' | 'shops';

// The directory of people and shops we sell to. It holds no money figures — a
// customer's balance, ledger and payments are Accounting › Receivables.
export default function CustomersView({ customers }: { customers: CustomerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [creating, setCreating] = useState(false);

  const activeCount = customers.filter((c) => c.active).length;
  const shopCount = customers.filter((c) => c.type === 'SHOP').length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
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
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">
            Registered customers and shops. What each one owes is under Accounting › Receivables.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Add customer</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="stat">
          <div className="stat__label">Registered</div>
          <div className="stat__value">{activeCount}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Shops (bulk buyers)</div>
          <div className="stat__value">{shopCount}</div>
        </div>
      </div>

      <div className="mb-4">
        <input className="input" placeholder="Search name or phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex gap-2 mt-3">
          <button className="chip" data-active={filter === 'all' || undefined} onClick={() => setFilter('all')}>All</button>
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
                <th>Address</th>
                <th className="text-center">Purchases</th>
                <th>Last purchase</th>
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
                      <button className="text-left" onClick={() => setEditing(c)}>
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
                    <td className="text-[13px]" style={{ color: 'var(--color-ash)' }}>{c.address || '—'}</td>
                    <td className="text-center num">{c.salesCount}</td>
                    <td className="text-[13px] whitespace-nowrap" style={{ color: 'var(--color-muted)' }}>
                      {c.lastPurchaseAt ? fmtDateTime(c.lastPurchaseAt) : '—'}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link className="btn btn-ghost btn-sm" href={`/accounting/receivables?customer=${c.id}`}>Account</Link>
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
