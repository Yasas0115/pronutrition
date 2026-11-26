'use client';

import { useEffect } from 'react';
import { useT } from '@/components/I18nProvider';

/** What staff see when a page crashes. Shared by the error boundaries in app/. */
export default function ErrorScreen({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  const t = useT();

  // After a server crash the root layout's theme script does not run, so the
  // saved theme is applied here when the page has none.
  useEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute('data-theme')) return;
    try {
      const saved = localStorage.getItem('theme');
      const light = saved ? saved === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
      root.setAttribute('data-theme', light ? 'light' : 'dark');
    } catch {
      // Storage blocked: keep the default dark theme.
    }
  }, []);

  return (
    <div className="card mx-auto my-10 flex max-w-lg flex-col items-center gap-4 p-8 text-center" role="alert">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-strong)' }}>
        {t('Something went wrong')}
      </h1>
      <p style={{ color: 'var(--color-ash)' }}>
        {t('This page could not be loaded. Check the connection and try again.')}
      </p>
      <p style={{ color: 'var(--color-ash)' }}>
        {t('If you were saving a sale or payment, check that it is not already recorded before entering it again.')}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          {t('Try again')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
          {t('Reload page')}
        </button>
        {/* A full page load, not <Link>: it also recovers from a broken client state. */}
        <a className="btn btn-ghost" href="/">
          {t('Go to dashboard')}
        </a>
      </div>
      {digest && (
        <p className="text-xs" style={{ color: 'var(--color-ash)' }}>
          {t('Error code: {0}', [digest])}
        </p>
      )}
    </div>
  );
}
