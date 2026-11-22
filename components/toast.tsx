'use client';

import { useEffect, useState } from 'react';
import { useT } from './I18nProvider';

type Toast = { id: number; msg: string; err?: boolean };
let push: (t: Omit<Toast, 'id'>) => void = () => {};

export function toast(msg: string, err = false) {
  push({ msg, err });
}

export function Toaster() {
  const t = useT();
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    push = (n) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { ...n, id }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 2800);
    };
    return () => { push = () => {}; };
  }, []);

  return (
    // Phones: full-width strip under the header, clear of the POS cart bar at
    // the bottom. Larger screens: bottom-right corner.
    <div className="fixed top-[76px] left-4 right-4 sm:top-auto sm:left-auto sm:bottom-6 sm:right-6 z-[100] flex flex-col gap-[10px]">
      {items.map((n) => (
        <div
          key={n.id}
          className="animate-slide-in text-strong text-sm px-[18px] py-[13px] rounded-lg"
          style={{
            background: 'var(--color-ink-3)',
            border: '1px solid var(--color-line-2)',
            borderLeft: `3px solid ${n.err ? 'var(--color-brand)' : 'var(--color-ok)'}`,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Messages from server actions arrive as finished English text; the
              dictionary's placeholder keys translate those too. */}
          {t(n.msg)}
        </div>
      ))}
    </div>
  );
}
