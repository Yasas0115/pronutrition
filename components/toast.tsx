'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; msg: string; err?: boolean };
let push: (t: Omit<Toast, 'id'>) => void = () => {};

export function toast(msg: string, err = false) {
  push({ msg, err });
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { ...t, id }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 2800);
    };
    return () => { push = () => {}; };
  }, []);

  return (
    // Phones: full-width strip under the header, clear of the POS cart bar at
    // the bottom. Larger screens: bottom-right corner.
    <div className="fixed top-[76px] left-4 right-4 sm:top-auto sm:left-auto sm:bottom-6 sm:right-6 z-[100] flex flex-col gap-[10px]">
      {items.map((t) => (
        <div
          key={t.id}
          className="animate-slide-in text-strong text-sm px-[18px] py-[13px] rounded-lg"
          style={{
            background: 'var(--color-ink-3)',
            border: '1px solid var(--color-line-2)',
            borderLeft: `3px solid ${t.err ? 'var(--color-brand)' : 'var(--color-ok)'}`,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
