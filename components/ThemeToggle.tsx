'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

/**
 * Sun/moon toggle. The initial attribute is applied pre-paint by the
 * inline script in the root layout, so here we just read the current
 * value on mount and keep it in sync with localStorage on click.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
    setTheme(current);
    setReady(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode / storage disabled — theme still applies for this session */
    }
    setTheme(next);
  };

  const dark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-ghost btn-sm ${className}`}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      // Hidden until mounted so SSR (which can't know the stored theme)
      // never renders the wrong icon.
      style={{ visibility: ready ? 'visible' : 'hidden', padding: 8, width: 38, height: 38 }}
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {dark ? (
          // Moon — click to go light
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        ) : (
          // Sun — click to go dark
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </>
        )}
      </svg>
    </button>
  );
}
