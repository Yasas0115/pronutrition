'use client';

import { useEffect, useState } from 'react';

/**
 * Small header button that toggles browser fullscreen. In fullscreen the
 * browser chrome (tabs, address bar) is hidden, giving the POS a clean
 * kiosk-style view. Icon flips between "expand" and "compress".
 */
export default function FullscreenToggle({ className = '' }: { className?: string }) {
  const [full, setFull] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    // Some embedded/webview contexts don't expose the Fullscreen API.
    setSupported(typeof document !== 'undefined' && !!document.documentElement.requestFullscreen);
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        document.documentElement.requestFullscreen?.();
      }
    } catch {
      /* denied by the browser — ignore */
    }
  };

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-ghost btn-sm ${className}`}
      aria-label={full ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={full ? 'Exit fullscreen' : 'Enter fullscreen'}
      style={{ padding: 8, width: 38, height: 38 }}
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
        {full ? (
          // Compress / minimize — arrows pointing inward
          <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />
        ) : (
          // Expand / maximize — arrows pointing outward
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
        )}
      </svg>
    </button>
  );
}
