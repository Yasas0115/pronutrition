'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './toast';
import { setStock } from '@/app/products/actions';

/**
 * Inline stock editor for the products table.
 *   • − / + buttons step by 1
 *   • ↑ / ↓ arrow keys step by 1 while the field is focused
 *   • typing sets an absolute value (commits on Enter or blur)
 * Every change writes an absolute value through `setStock`, then refreshes.
 */
export default function StockStepper({
  id,
  value,
  lowStockAt,
}: {
  id: string;
  value: number;
  lowStockAt: number;
}) {
  const router = useRouter();
  const [val, setVal] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync with the server value whenever it changes and we're not
  // mid-edit (e.g. after another action refreshes the page).
  useEffect(() => {
    if (!editing) setVal(String(value));
  }, [value, editing]);

  const current = () => {
    const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  function commit(next: number) {
    const n = Math.max(0, Math.round(next));
    setVal(String(n));
    if (n === value) return; // nothing to save
    startTransition(async () => {
      const res = await setStock(id, n);
      if (res.ok) router.refresh();
      else {
        toast(res.error, true);
        setVal(String(value));
      }
    });
  }

  function step(delta: number) {
    commit(current() + delta);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setVal(String(value));
      inputRef.current?.blur();
    }
  }

  const out = value <= 0;
  const low = !out && value <= lowStockAt;
  const color = out
    ? 'var(--color-brand)'
    : low
      ? 'var(--color-warn)'
      : 'var(--color-strong)';

  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        className="qtybtn"
        onClick={() => step(-1)}
        disabled={pending || current() <= 0}
        aria-label="Reduce stock"
      >
        −
      </button>
      <input
        ref={inputRef}
        className="num stock-input"
        inputMode="numeric"
        value={val}
        style={{ color }}
        aria-label="Stock quantity"
        onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setEditing(false);
          commit(current());
        }}
        disabled={pending}
      />
      <button
        className="qtybtn"
        onClick={() => step(1)}
        disabled={pending}
        aria-label="Add stock"
      >
        +
      </button>
    </div>
  );
}
