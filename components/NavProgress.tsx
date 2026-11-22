'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Thin top progress bar shown while a page is loading after a link click.
// Next.js already loads pages with AJAX (client-side navigation); this just
// gives instant visual feedback while the server renders the next page.
// Purely additive: it only listens for clicks and never blocks navigation.
export default function NavProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);

  function clearTimers() {
    if (timer.current) clearInterval(timer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    timer.current = null;
    hideTimer.current = null;
  }

  function start() {
    clearTimers();
    active.current = true;
    setVisible(true);
    setWidth(8);
    // Creep toward 90% but never finish until the new page actually arrives.
    timer.current = setInterval(() => {
      setWidth((w) => (w < 90 ? w + (90 - w) * 0.12 : w));
    }, 200);
  }

  function finish() {
    if (!active.current) return;
    active.current = false;
    clearTimers();
    setWidth(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
  }

  // New page arrived -> complete the bar.
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Link click to a different internal page -> start the bar.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      start();
    }
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      clearTimers();
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      aria-hidden
      className="no-print"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: 3,
        width: `${width}%`,
        background: 'var(--color-brand)',
        boxShadow: '0 0 8px var(--color-brand)',
        transition: 'width 200ms ease-out',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  );
}
