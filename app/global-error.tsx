'use client';

import { useEffect, useState } from 'react';
import './globals.css';
import ErrorScreen from '@/components/ErrorScreen';
import I18nProvider from '@/components/I18nProvider';
import { LOCALE_COOKIE, isLocale, type Dict, type Locale } from '@/lib/i18n/translate';

// Last resort: the root layout itself crashed, so this replaces the whole
// document. The layout's language provider is gone, so the language is restored
// here from the cookie.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [lang, setLang] = useState<{ locale: Locale; dict: Dict | null }>({ locale: 'en', dict: null });

  useEffect(() => {
    const v = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1];
    if (!isLocale(v) || v === 'en') return;
    const load = v === 'si' ? import('@/lib/i18n/dict/si') : import('@/lib/i18n/dict/ta');
    // If the dictionary cannot be downloaded (server down), English stays.
    load.then((m) => setLang({ locale: v, dict: m.default })).catch(() => {});
  }, []);

  return (
    <html lang={lang.locale}>
      <body>
        <I18nProvider locale={lang.locale} dict={lang.dict}>
          <main className="px-4">
            {/* Nothing is left to re-render in place, so retry means a full reload. */}
            <ErrorScreen digest={error.digest} onRetry={() => window.location.reload()} />
          </main>
        </I18nProvider>
      </body>
    </html>
  );
}
