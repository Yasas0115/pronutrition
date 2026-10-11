'use client';

import { useState, useTransition } from 'react';
import { toast } from './toast';

export type NameListItem = {
  id: string;
  name: string;
  /** Small text on the right, e.g. "3 products". */
  detail?: string;
  /** When set, removing asks for one more click and shows this label ("Delete · move 3"). */
  confirmLabel?: string;
};

export type ListResult = { ok: true; message?: string } | { ok: false; error: string };

// The add / (rename) / remove list behind both product categories and expense
// categories. It only draws the list and calls back; what "remove" means (move
// products to Uncategorized, keep history…) is each caller's server action.
export default function NameListManager({
  items,
  placeholder,
  emptyText,
  maxLength = 40,
  onAdd,
  onRemove,
  onRename,
  onChanged,
}: {
  items: NameListItem[];
  placeholder: string;
  emptyText: string;
  maxLength?: number;
  onAdd: (name: string) => Promise<ListResult>;
  onRemove: (id: string) => Promise<ListResult>;
  /** Leave out to make names read-only (click-to-rename is then off). */
  onRename?: (id: string, name: string) => Promise<ListResult>;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<ListResult>, after?: () => void) {
    startTransition(async () => {
      const res = await task();
      if (res.ok) {
        if (res.message) toast(res.message);
        after?.();
        onChanged();
      } else {
        toast(res.error, true);
      }
    });
  }

  function add() {
    const n = name.trim();
    if (!n) { toast('Enter a name.', true); return; }
    run(() => onAdd(n), () => setName(''));
  }

  function remove(id: string) {
    run(() => onRemove(id), () => setConfirmId(null));
  }

  function saveRename(id: string) {
    const n = editName.trim();
    if (!n || !onRename) { setEditId(null); return; }
    run(() => onRename(id, n), () => setEditId(null));
  }

  return (
    <>
      <div className="flex gap-2 mb-4">
        <input
          className="input"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          maxLength={maxLength}
        />
        <button className="btn btn-primary shrink-0" onClick={add} disabled={pending}>+ Add</button>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-[14px]" style={{ color: 'var(--color-faint)', padding: '20px' }}>{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
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
                  maxLength={maxLength}
                />
              ) : onRename ? (
                <button
                  className="text-left flex-1 min-w-0"
                  onClick={() => { setEditId(c.id); setEditName(c.name); }}
                  title="Click to rename"
                >
                  <span className="text-strong font-semibold text-[15px]">{c.name}</span>
                </button>
              ) : (
                <span className="text-strong font-semibold text-[15px] flex-1 min-w-0">{c.name}</span>
              )}

              {c.detail && (
                <span className="text-[12px] shrink-0 num" style={{ color: 'var(--color-muted)' }}>{c.detail}</span>
              )}

              {confirmId === c.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)} disabled={pending}>
                    {c.confirmLabel ?? 'Confirm'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)} disabled={pending}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="qtybtn shrink-0"
                  onClick={() => (c.confirmLabel ? setConfirmId(c.id) : remove(c.id))}
                  disabled={pending}
                  aria-label={`Remove ${c.name}`}
                  title="Remove"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
