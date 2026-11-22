'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchPalette, type PaletteHit } from '@/app/palette/actions';
import { useT } from '@/components/I18nProvider';

type Page = { href: string; label: string };
type Row = { key: string; group: string; title: string; sub?: string; href: string };

// Ctrl+K quick finder: jump to any page you can open, or find a product /
// customer by name. It only navigates; it never changes data.
export default function CommandPalette({ pages, onClose }: { pages: Page[]; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Server search, debounced; stale answers are ignored.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let live = true;
    const id = setTimeout(async () => {
      try {
        const res = await searchPalette(term);
        if (live) setHits(res);
      } catch { if (live) setHits([]); }
    }, 200);
    return () => { live = false; clearTimeout(id); };
  }, [q]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out: Row[] = [];
    for (const p of pages) {
      const label = t(p.label);
      if (!term || label.toLowerCase().includes(term) || p.label.toLowerCase().includes(term)) {
        out.push({ key: `p:${p.href}`, group: t("Go to"), title: label, href: p.href });
      }
    }
    for (const h of hits) {
      out.push({ key: `${h.kind}:${h.id}`, group: h.kind === 'product' ? t("Products") : t("Customers"), title: h.title, sub: h.sub, href: h.href });
    }
    return out;
  }, [pages, hits, q, t]);

  useEffect(() => { setActive(0); }, [q, hits.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(r: Row | undefined) {
    if (!r) return;
    onClose();
    router.push(r.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(rows.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(rows[active]); }
  }

  let lastGroup = '';
  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh] no-print"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card animate-pop w-full overflow-hidden" style={{ maxWidth: 520, boxShadow: 'var(--shadow-pop)' }} role="dialog" aria-label={t("Quick search")}>
        <div className="flex items-center gap-2 px-4" style={{ borderBottom: '1px solid var(--color-line)' }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("Search pages, products, customers…")}
            className="flex-1 bg-transparent outline-none py-3.5 text-[15px]"
            style={{ color: 'var(--color-strong)' }}
          />
          <span className="hidden sm:inline text-[11px] rounded px-1.5" style={{ color: 'var(--color-faint)', border: '1px solid var(--color-line-2)' }}>Esc</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            title={t("Close")}
            className="btn btn-ghost btn-sm shrink-0"
            style={{ padding: 0, width: 32, height: 32 }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div ref={listRef} className="p-2 overflow-y-auto" style={{ maxHeight: '50vh' }}>
          {rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px]" style={{ color: 'var(--color-faint)' }}>{t("No matches.")}</div>
          ) : (
            rows.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <div key={r.key}>
                  {header && (
                    <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-faint)' }}>{header}</div>
                  )}
                  <button
                    type="button"
                    data-active={i === active}
                    className="menu-item w-full"
                    style={i === active ? { background: 'var(--color-ink-3)', color: 'var(--color-strong)' } : undefined}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(r)}
                  >
                    <span className="flex-1 text-left min-w-0 truncate">{r.title}</span>
                    {r.sub && <span className="text-[12px] shrink-0" style={{ color: 'var(--color-muted)' }}>{r.sub}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 text-[11.5px] flex gap-4" style={{ color: 'var(--color-faint)', borderTop: '1px solid var(--color-line)' }}>
          <span>↑↓ {t("move")}</span><span>Enter {t("open")}</span><span>Esc {t("close")}</span>
        </div>
      </div>
    </div>
  );
}
