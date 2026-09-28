'use client';

import { useEffect, type ReactNode } from 'react';

export default function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidth = 480,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card w-full animate-pop"
        style={{ maxWidth, boxShadow: 'var(--shadow-pop)', maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid var(--color-line)' }}
        >
          <h3
            className="m-0"
            style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 700, color: 'var(--color-strong)', textTransform: 'uppercase', letterSpacing: '.01em' }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[26px] leading-none px-1 bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--color-faint)' }}
          >
            ×
          </button>
        </div>
        <div className="px-6 py-[22px]">{children}</div>
        {footer && <div className="px-6 pb-[22px] pt-4 flex gap-[10px] justify-end">{footer}</div>}
      </div>
    </div>
  );
}
