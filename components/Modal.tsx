'use client';

import { useEffect, type ReactNode } from 'react';

export default function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidth = 480,
  flush = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  /** Drop the body padding so the content can run edge to edge. */
  flush?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Keep the page behind the dialog from scrolling along with it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="modal-wrap"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card modal-panel animate-pop"
        style={{ maxWidth, boxShadow: 'var(--shadow-pop)' }}
      >
        <div
          className="modal-head flex items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5"
          style={{ borderBottom: '1px solid var(--color-line)' }}
        >
          <h3
            className="m-0 min-w-0 truncate"
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
        <div className={flush ? '' : 'px-5 py-5 sm:px-6 sm:py-[22px]'}>{children}</div>
        {footer && <div className="modal-foot px-5 pb-5 pt-4 sm:px-6 sm:pb-[22px] flex gap-[10px] justify-end">{footer}</div>}
      </div>
    </div>
  );
}
