'use client';

import { useEffect, useState } from 'react';

/**
 * Pro Nutrition boot splash for the auth pages (login). It covers the page's
 * first paint, then fades out. Because it lives in AuthShell — not the app
 * shell — it shows every time login loads, including on a refresh, but never on
 * page-to-page navigation inside the app.
 */
export default function Splash({ label = 'Loading' }: { label?: string }) {
  const [phase, setPhase] = useState<'show' | 'leaving' | 'done'>('show');

  useEffect(() => {
    const leave = setTimeout(() => setPhase('leaving'), 1200);
    const done = setTimeout(() => setPhase('done'), 1650);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div
      className={`splash${phase === 'leaving' ? ' is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="splash__inner">
        <div className="splash__logo" style={{ fontSize: 'clamp(48px, 12vw, 92px)' }}>
          PRO<span className="accent">NUTRITION</span>
        </div>
        <span className="splash__rule" aria-hidden />
        <div className="splash__label">{label}</div>
        <div className="splash__bar" aria-hidden />
      </div>
    </div>
  );
}
