'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './toast';
import Modal from './Modal';
import { saveBranch, setBranchActive, deleteBranch } from '@/app/branches/actions';
import { useT } from '@/components/I18nProvider';

type Branch = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
  staff: number;
  sales: number;
  units: number;
};

export default function BranchesView({ branches }: { branches: Branch[] }) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);

  async function toggleActive(b: Branch) {
    const res = await setBranchActive(b.id, !b.active);
    if (res.ok) { toast(b.active ? t("Branch closed") : t("Branch re-opened")); router.refresh(); }
    else toast(res.error, true);
  }

  async function remove(b: Branch) {
    const heavy = b.staff > 0 || b.sales > 0 || b.units > 0;
    const warning = heavy
      ? t("Delete “{0}” for good?\n\nThis branch has {1} unit(s) in stock, {2} sale(s) and {3} staff.\n\n• Its stock will be wiped.\n• Sales history is kept (shown under this branch's name).\n• Staff will be unpinned to “all branches”.\n\nThis cannot be undone.", [b.name, b.units, b.sales, b.staff])
      : t("Delete “{0}”? This empty branch will be removed for good.", [b.name]);
    if (!confirm(warning)) return;
    const res = await deleteBranch(b.id, true);
    if (res.ok) { toast(t("Branch deleted")); router.refresh(); }
    else toast(res.error, true);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="page-title">{t("Branches")}</h1>
          <p className="page-sub">{t("Open new outlets and manage existing ones. Each branch keeps its own stock.")}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>{t("+ Open branch")}</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t("Branch")}</th>
                <th>{t("Contact")}</th>
                <th className="text-center">{t("Staff")}</th>
                <th className="text-center">{t("Units in stock")}</th>
                <th className="text-center">{t("Sales")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {branches.length === 0 ? (
                <tr><td colSpan={6} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>{t("No branches yet.")}</td></tr>
              ) : (
                branches.map((b) => (
                  <tr key={b.id} style={{ opacity: b.active ? 1 : 0.55 }}>
                    <td>
                      <button className="text-left" onClick={() => setEditing(b)}>
                        <div className="text-strong font-semibold">
                          {b.name}{b.code ? <span style={{ color: 'var(--color-muted)' }}> · {b.code}</span> : null}
                        </div>
                        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                          {b.active ? t("Open") : t("Closed")}
                        </div>
                      </button>
                    </td>
                    <td className="text-[13px]" style={{ color: 'var(--color-ash)' }}>
                      {[b.phone, b.address].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="text-center num">{b.staff}</td>
                    <td className="text-center num">{b.units}</td>
                    <td className="text-center num">{b.sales}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(b)}>{t("Edit")}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(b)}>
                        {b.active ? t("Close") : t("Re-open")}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--color-brand)' }}
                        onClick={() => remove(b)}
                        title={t("Delete this branch")}
                      >
                        {t("Delete")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <BranchModal
          branch={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); router.refresh(); }}
        />
      )}
    </>
  );
}

function BranchModal({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const editing = !!branch;
  const [name, setName] = useState(branch?.name ?? '');
  const [code, setCode] = useState(branch?.code ?? '');
  const [phone, setPhone] = useState(branch?.phone ?? '');
  const [address, setAddress] = useState(branch?.address ?? '');
  const [active, setActive] = useState(branch?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast(t("Enter a branch name."), true); return; }
    setSaving(true);
    const res = await saveBranch({ id: branch?.id, name, code, phone, address, active });
    setSaving(false);
    if (res.ok) { toast(editing ? t("Branch updated") : t("Branch opened")); onSaved(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title={editing ? t("Edit branch") : t("Open a branch")}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>{t("Cancel")}</button>
          <button className="btn btn-primary" onClick={save} aria-busy={saving} disabled={saving}>
            {saving ? t("Saving…") : editing ? t("Save changes") : t("Open branch")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="field-label">{t("Branch name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Kandy")} autoFocus />
          </div>
          <div style={{ width: 120 }}>
            <label className="field-label">{t("Code")}</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("KDY")} />
          </div>
        </div>
        <div>
          <label className="field-label">{t("Phone")}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94 81 222 3344" />
        </div>
        <div>
          <label className="field-label">{t("Address")}</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("No. 5, Peradeniya Road, Kandy")} />
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--color-brand)' }} />
          <span className="text-[14px]" style={{ color: 'var(--color-ash)' }}>{t("Open (available for sales & staff)")}</span>
        </label>
      </div>
    </Modal>
  );
}
