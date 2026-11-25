'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/I18nProvider';

/**
 * Slim footer shown at the very end of every signed-in page (it scrolls with
 * the content, so the POS grid and its fixed-height panes are untouched).
 *
 *   left   : logo mark + © year + store name
 *   centre : keyboard-shortcut hints (desktop only)
 *   right  : live connection state, active branch, clock
 *
 * The clock / year / connection state are only read after mount so the server
 * and client markup always match.
 */
export default function AppFooter({
  storeName,
  logoUrl,
  branchName,
}: {
  storeName: string;
  logoUrl: string | null;
  branchName: string;
}) {
  const t = useT();
  const [now, setNow] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const year = now ? now.getFullYear() : '';
  const time = now ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const date = now ? now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '';

  return (
    <footer className="app-footer no-print">
      <div className="app-footer__row">
        <div className="app-footer__brand">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="app-footer__logo" />
          )}
          <div className="min-w-0">
            <div className="app-footer__name truncate">{storeName}</div>
            <div className="app-footer__copy">
              © {year} {storeName} · {t("All rights reserved")}
            </div>
          </div>
        </div>

        <div className="app-footer__keys" aria-label={t("Keyboard shortcuts")}>
          <span><kbd>Ctrl</kbd><kbd>K</kbd>{t("Search")}</span>
          <span><kbd>Ctrl</kbd><kbd>B</kbd>{t("Sidebar")}</span>
        </div>

        <div className="app-footer__status">
          <span className="app-footer__pill" data-online={online || undefined} role="status">
            <i aria-hidden />
            {online ? t("Online") : t("Offline")}
          </span>
          {branchName && <span className="app-footer__chip">{t(branchName)}</span>}
          {time && (
            <span className="app-footer__chip num" suppressHydrationWarning>
              <span className="hidden sm:inline">{date} · </span>{time}
            </span>
          )}
          <span className="app-footer__credit">
            <span aria-hidden>&lt;/&gt;</span>
            <b>y4sas_o115</b>
          </span>
        </div>
      </div>
    </footer>
  );
}
