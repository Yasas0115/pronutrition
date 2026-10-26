'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './toast';
import Modal from './Modal';
import { saveUser, deleteUser } from '@/app/users/actions';
import { sendUserResetEmail } from '@/app/password/actions';
import { STAFF_MODULES, MODULE_GROUPS, ROLE_PRESETS, parseUserModules, type ModuleKey } from '@/lib/modules';

type Role = 'OWNER' | 'STAFF';
type User = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  title: string | null;
  modules: string; // comma-separated module keys
  branchId: string | null;
  branchName: string | null;
};
type BranchOpt = { id: string; name: string };

const moduleLabel = new Map<ModuleKey, string>(STAFF_MODULES.map((m) => [m.key, m.label]));

export default function UsersView({
  users,
  branches,
  currentUserId,
}: {
  users: User[];
  branches: BranchOpt[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  async function remove(u: User) {
    if (!confirm(`Remove “${u.name || u.email}”? This staff account will be deleted for good.`)) return;
    const res = await deleteUser(u.id);
    if (res.ok) { toast('User removed'); router.refresh(); }
    else toast(res.error, true);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-sub">Add any staff — cashier, accountant, manager — and pick exactly which modules each one can open.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Add user</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>User</th><th>Role</th><th>Branch</th><th>Access</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const grants = u.role === 'OWNER' ? null : Array.from(parseUserModules(u.modules));
                return (
                  <tr key={u.id}>
                    <td>
                      <button className="text-left" onClick={() => setEditing(u)}>
                        <div className="text-strong font-semibold">{u.name || u.email}</div>
                        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>{u.email}</div>
                      </button>
                    </td>
                    <td>
                      <span className="badge" style={{ color: u.role === 'OWNER' ? 'var(--color-brand)' : 'var(--color-muted)', background: 'var(--color-ink-1)' }}>
                        {u.role === 'OWNER' ? 'Owner' : u.title?.trim() || 'Staff'}
                      </span>
                    </td>
                    <td className="text-[13px]" style={{ color: 'var(--color-ash)' }}>
                      {u.role === 'OWNER' || !u.branchId ? 'All branches' : u.branchName ?? '—'}
                    </td>
                    <td className="text-[12px]" style={{ color: 'var(--color-ash)', maxWidth: 260 }}>
                      {u.role === 'OWNER'
                        ? 'Everything'
                        : grants && grants.length
                          ? grants.map((k) => moduleLabel.get(k) ?? k).join(', ')
                          : '—'}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>Edit</button>
                      {u.id !== currentUserId && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--color-brand)' }}
                          onClick={() => remove(u)}
                          title="Delete this staff account"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <UserModal
          user={editing}
          branches={branches}
          isSelf={editing?.id === currentUserId}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); router.refresh(); }}
        />
      )}
    </>
  );
}

function UserModal({
  user,
  branches,
  isSelf,
  onClose,
  onSaved,
}: {
  user: User | null;
  branches: BranchOpt[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!user;
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'STAFF');
  const [title, setTitle] = useState(user?.title ?? '');
  const [modules, setModules] = useState<Set<ModuleKey>>(
    () => (user && user.role === 'STAFF' ? parseUserModules(user.modules) : new Set<ModuleKey>(['pos'])),
  );
  // '' = all branches; otherwise a concrete branch id.
  const [branchId, setBranchId] = useState<string>(user?.branchId ?? '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Existing people never get a password typed in here — a one-time link goes to
  // the email address on file instead.
  async function sendReset() {
    if (!user) return;
    setSending(true);
    const res = await sendUserResetEmail(user.id);
    setSending(false);
    if (res.ok) toast(`Reset link sent to ${res.email}`);
    else toast(res.error, true);
  }

  function toggleModule(key: ModuleKey) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        next.add(key);
        // Full finance already covers adding expenses.
        if (key === 'finance') next.delete('expenses_add');
      }
      return next;
    });
  }

  function applyPreset(keys: ModuleKey[]) {
    setModules(new Set(keys));
  }

  const activePreset =
    ROLE_PRESETS.find((p) => p.modules.length === modules.size && p.modules.every((k) => modules.has(k)))?.id ?? 'custom';

  const summary = MODULE_GROUPS.flatMap((g) => g.items)
    .filter((m) => modules.has(m.key))
    .map((m) => m.short);

  async function save() {
    if (!email.trim()) { toast('Enter an email.', true); return; }
    if (role === 'STAFF' && modules.size === 0) { toast('Tick at least one module for this staff member.', true); return; }
    setSaving(true);
    const res = await saveUser({
      id: user?.id,
      name,
      email,
      role,
      title: role === 'STAFF' ? title : undefined,
      modules: role === 'STAFF' ? Array.from(modules) : undefined,
      branchId: role === 'STAFF' ? branchId || null : null,
      // Only a brand-new account gets a typed first password.
      password: editing ? undefined : password || undefined,
    });
    setSaving(false);
    if (res.ok) { toast(editing ? 'User updated' : 'User added'); onSaved(); }
    else toast(res.error, true);
  }

  async function remove() {
    setSaving(true);
    const res = await deleteUser(user!.id);
    setSaving(false);
    if (res.ok) { toast('User removed'); onSaved(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title={editing ? 'Edit user' : 'Add user'}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          {editing && !isSelf && (
            <button className="btn btn-danger mr-auto" onClick={() => (confirmDel ? remove() : setConfirmDel(true))} disabled={saving}>
              {confirmDel ? 'Confirm delete' : 'Delete'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add user'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nimal Perera" autoFocus />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nimal@store.local" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="STAFF">Staff (limited access)</option>
              <option value="OWNER">Owner (full access)</option>
            </select>
          </div>
          {role === 'STAFF' && (
            <div>
              <label className="field-label">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Accountant, Cashier…" />
            </div>
          )}
        </div>

        {role === 'STAFF' && (
          <>
            <div>
              <label className="field-label">Branch</label>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label className="field-label">What can this user open?</label>

              <div className="text-[12px] mt-1 mb-1.5" style={{ color: 'var(--color-muted)' }}>Quick start — pick a role, then adjust below</div>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_PRESETS.map((p) => {
                  const active = activePreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="btn btn-sm"
                      onClick={() => applyPreset(p.modules)}
                      style={{
                        background: active ? 'var(--color-brand)' : 'var(--color-ink-1)',
                        color: active ? '#fff' : 'var(--color-ash)',
                        border: '1px solid var(--color-line-2)',
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
                <span
                  className="btn btn-sm"
                  style={{
                    pointerEvents: 'none',
                    background: activePreset === 'custom' ? 'var(--color-brand)' : 'transparent',
                    color: activePreset === 'custom' ? '#fff' : 'var(--color-muted)',
                    border: '1px dashed var(--color-line-2)',
                  }}
                >
                  Custom
                </span>
              </div>

              <div className="flex flex-col gap-3.5 mt-3.5">
                {MODULE_GROUPS.map((g) => (
                  <div key={g.title}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-muted)' }}>
                      {g.title}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {g.items.map((m) => {
                        const covered = m.key === 'expenses_add' && modules.has('finance');
                        const on = modules.has(m.key) || covered;
                        return (
                          <label
                            key={m.key}
                            className="flex items-start gap-2.5 select-none rounded-lg px-3 py-2.5"
                            style={{
                              background: 'var(--color-ink-1)',
                              border: `1px solid ${on && !covered ? 'var(--color-brand)' : 'var(--color-line-2)'}`,
                              cursor: covered ? 'not-allowed' : 'pointer',
                              opacity: covered ? 0.55 : 1,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={covered}
                              onChange={() => toggleModule(m.key)}
                              style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--color-brand)' }}
                            />
                            <span className="flex-1">
                              <span className="flex items-center gap-2 text-[13px] text-strong font-semibold">
                                {moduleLabel.get(m.key)}
                                {m.sensitive && (
                                  <span className="badge" style={{ color: 'var(--color-brand)', background: 'var(--color-ink-2, var(--color-ink-1))' }}>Sensitive</span>
                                )}
                              </span>
                              <span className="block text-[12px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                                {covered ? 'Already included in Full finance.' : m.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg px-3 py-2 mt-3.5 text-[12px]" style={{ background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)', color: 'var(--color-ash)' }}>
                <b>This user will see:</b>{' '}
                {summary.length ? summary.join(' · ') : 'Nothing yet — tick at least one module.'}
              </div>
              <p className="text-[12px] mt-1.5" style={{ color: 'var(--color-muted)' }}>
                Only company-enabled modules take effect. Settings stays owner-only.
              </p>
            </div>
          </>
        )}

        {editing ? (
          <div className="rounded-lg px-3 py-3" style={{ background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}>
            <div className="text-[13px] text-strong font-semibold">Password</div>
            <p className="text-[12px] mt-0.5 mb-2" style={{ color: 'var(--color-muted)' }}>
              Passwords change only through a one-time link sent to <b>{user!.email}</b>. The link works
              once and expires in 30 minutes.
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={sendReset} disabled={sending || saving}>
              {sending ? 'Sending…' : 'Send password reset email'}
            </button>
          </div>
        ) : (
          <div>
            <label className="field-label">First password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            <p className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>
              At least 6 characters. After this, the password can only be changed through a link sent to their email.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
