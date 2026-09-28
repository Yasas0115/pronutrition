'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './toast';
import { addCategory, deleteCategory, renameCategory } from '@/app/categories/actions';

export type CategoryRow = { id: string; name: string; count: number };

export default function CategoryManager({
  categories,
}: {
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [pending, startTransition] = useTransition();

  function add() {
    const n = name.trim();
    if (!n) { toast('Enter a category name.', true); return; }
    startTransition(async () => {
      const res = await addCategory(n);
      if (res.ok) {
        setName('');
        toast('Category added');
        router.refresh();
      } else {
        toast(res.error, true);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteCategory(id);
      setConfirmId(null);
      if (res.ok) {
        toast(res.moved > 0
          ? `Category deleted · ${res.moved} product${res.moved === 1 ? '' : 's'} moved to Uncategorized`
          : 'Category deleted');
        router.refresh();
      } else {
        toast(res.error, true);
      }
    });
  }

  function saveRename(id: string) {
    const n = editName.trim();
    if (!n) { setEditId(null); return; }
    startTransition(async () => {
      const res = await renameCategory(id, n);
      if (res.ok) {
        setEditId(null);
        router.refresh();
      } else {
        toast(res.error, true);
      }
    });
  }

  return (
    <div className="card p-5">
      {/* Add row */}
      <div className="flex items-center justify-between mb-2">
        <span className="side-label" style={{ padding: 0 }}>All categories</span>
        <span className="text-[13px]" style={{ color: 'var(--color-faint)' }}>
          {categories.length} total
        </span>
      </div>
      <div className="flex gap-2 mb-4">
        <input
          className="input"
          placeholder="New category name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          maxLength={40}
        />
        <button className="btn btn-primary shrink-0" onClick={add} disabled={pending}>
          + Add
        </button>
      </div>

      {/* List */}
      {categories.length === 0 ? (
        <p className="text-center text-[14px]" style={{ color: 'var(--color-faint)', padding: '20px' }}>
          No categories yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5"
              style={{ background: 'var(--color-ink-1)', border: '1px solid var(--color-line)' }}
            >
              {editId === c.id ? (
                <input
                  className="input"
                  style={{ padding: '6px 10px', fontSize: 14 }}
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(c.id);
                    if (e.key === 'Escape') setEditId(null);
                  }}
                  onBlur={() => saveRename(c.id)}
                  maxLength={40}
                />
              ) : (
                <button
                  className="text-left flex-1 min-w-0"
                  onClick={() => { setEditId(c.id); setEditName(c.name); }}
                  title="Click to rename"
                >
                  <span className="text-strong font-semibold text-[15px]">{c.name}</span>
                </button>
              )}

              <span
                className="text-[12px] shrink-0 num"
                style={{ color: c.count ? 'var(--color-muted)' : 'var(--color-faint)' }}
              >
                {c.count} product{c.count === 1 ? '' : 's'}
              </span>

              {confirmId === c.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)} disabled={pending}>
                    {c.count ? `Delete · move ${c.count}` : 'Confirm'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)} disabled={pending}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="qtybtn shrink-0"
                  onClick={() => setConfirmId(c.id)}
                  disabled={pending}
                  aria-label={`Delete ${c.name}`}
                  title="Delete category"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
