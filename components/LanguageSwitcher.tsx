'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useT } from './I18nProvider';
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, LOCALE_SHORT, type Locale } from '@/lib/i18n/translate';

/**
 * Language picker (English / සිංහල / தமிழ்). The choice lives in a cookie so the
 * server can render the right language on the very first paint; router.refresh()
 * re-renders the current page in the new language without losing client state
 * outside the page.
 */
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('Language')}
        title={t('Language')}
        style={{ height: 38, minWidth: 44, padding: '0 10px', fontWeight: 600 }}
      >
        {LOCALE_SHORT[locale]}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 z-50 rounded-lg overflow-hidden"
          style={{
            minWidth: 140,
            background: 'var(--color-ink-3)',
            border: '1px solid var(--color-line-2)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {LOCALES.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button
                type="button"
                onClick={() => pick(l)}
                className="w-full text-left text-sm px-4 py-2.5 text-strong"
                style={{
                  background: l === locale ? 'var(--color-ink-2, transparent)' : 'transparent',
                  fontWeight: l === locale ? 700 : 400,
                }}
              >
                {LOCALE_NAMES[l]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
