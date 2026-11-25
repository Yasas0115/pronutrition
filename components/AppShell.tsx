'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Role } from '@/lib/session';
import type { ModuleKey, BranchLite } from '@/lib/modules';
import { ALL_BRANCHES } from '@/lib/modules';
import { logoutAction, switchBranchAction } from '@/app/actions';
import { requestOwnPasswordChange } from '@/app/password/actions';
import { buildNav, isActivePath, type NavIcon, type NavItem } from '@/lib/nav';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import FullscreenToggle from './FullscreenToggle';
import CommandPalette from './CommandPalette';
import AppFooter from './AppFooter';
import { toast } from './toast';
import { useT } from '@/components/I18nProvider';

type IconName = NavIcon | 'key' | 'logout' | 'chevron' | 'menu' | 'collapse';

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  const size = name === 'chevron' ? 16 : 20;
  return (
    <svg {...common} width={size} height={size} className={className} aria-hidden>
      {name === 'pos' && (
        <>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </>
      )}
      {name === 'products' && (
        <>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </>
      )}
      {name === 'stock' && (
        <>
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 7v10l9 4 9-4V7" />
          <path d="M12 11v10" />
        </>
      )}
      {name === 'tag' && (
        <>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </>
      )}
      {name === 'store' && (
        <>
          <path d="M3 9l1.5-5h15L21 9" />
          <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
          <path d="M3 9h18" />
          <path d="M9 20v-6h6v6" />
        </>
      )}
      {name === 'receipt' && (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </>
      )}
      {name === 'wallet' && (
        <>
          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
          <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
          <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
        </>
      )}
      {name === 'trend' && (
        <>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </>
      )}
      {name === 'list' && (
        <>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </>
      )}
      {name === 'shield' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
      {name === 'sales' && (
        <>
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="16" />
        </>
      )}
      {name === 'key' && (
        <>
          <circle cx="8" cy="15" r="4" />
          <path d="M10.85 12.15 19 4" />
          <path d="M18 5l2 2" />
          <path d="M15 8l2 2" />
        </>
      )}
      {name === 'customer' && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </>
      )}
      {name === 'accounts' && (
        <>
          <rect x="2" y="6" width="20" height="13" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 15h4" />
        </>
      )}
      {name === 'settings' && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </>
      )}
      {name === 'logout' && (
        <>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </>
      )}
      {name === 'branch' && (
        <>
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 21v-6h6v6" />
          <path d="M9 10h.01" /><path d="M15 10h.01" />
        </>
      )}
      {name === 'users' && (
        <>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      )}
      {name === 'chevron' && <polyline points="6 9 12 15 18 9" />}
      {name === 'collapse' && (
        <>
          <polyline points="11 17 6 12 11 7" />
          <polyline points="18 17 13 12 18 7" />
        </>
      )}
      {name === 'menu' && (
        <>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      )}
    </svg>
  );
}

// Pages that read better in the narrower column. Everything else (tables, POS,
// reports) gets the wide one. Decided from the URL so the shared layout can
// resize the content area as you navigate, without each page passing a prop.
const NARROW_PATHS = ['/branches', '/categories', '/settings', '/users'];

export default function AppShell({
  username,
  role,
  storeName,
  logoUrl,
  modules,
  branches = [],
  activeScope = ALL_BRANCHES,
  activeBranchName = '',
  canSwitchBranch,
  wide,
  children,
}: {
  username: string;
  role: Role;
  storeName: string;
  logoUrl: string | null;
  modules?: ModuleKey[];
  branches?: BranchLite[];
  activeScope?: string;
  activeBranchName?: string;
  canSwitchBranch?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const [pwBusy, setPwBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const isWide = wide ?? !NARROW_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // Desktop sidebar can shrink to an icon rail (the hamburger / Ctrl+B). The
  // choice is remembered. Phones keep the existing slide-in drawer, so the rail
  // only ever applies at the md breakpoint and up.
  const [collapsed, setCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [flyout, setFlyout] = useState<{ key: string; top: number } | null>(null);
  const rail = collapsed && isDesktop;

  useEffect(() => {
    try {
      if (localStorage.getItem('sidebar-collapsed') === '1') setCollapsed(true);
    } catch {}
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  function toggleSidebar() {
    setFlyout(null);
    if (!isDesktop) {
      setNavOpen((v) => !v);
      return;
    }
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }
  // Latest toggle for the keyboard listener below.
  const toggleRef = useRef(toggleSidebar);
  toggleRef.current = toggleSidebar;

  // The shell now stays mounted between pages: close the drawer / account menu
  // and scroll the content back to the top whenever the page changes.
  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
    setFlyout(null);
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Ctrl/Cmd+K opens the quick finder, Ctrl/Cmd+B toggles the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (k === 'b') {
        e.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!flyout) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFlyout(null); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [flyout]);

  // There is no "type a new password" box: a link is emailed to the signed-in
  // person's own address, which proves the mailbox is theirs.
  async function changePassword() {
    setPwBusy(true);
    const res = await requestOwnPasswordChange();
    setPwBusy(false);
    setMenuOpen(false);
    if (res.ok) toast(t("We emailed a link to {0}", [res.email]));
    else toast(res.error, true);
  }

  function onBranchChange(value: string) {
    startSwitch(async () => {
      await switchBranchAction(value);
      router.refresh();
    });
  }

  const owner = role === 'OWNER';
  const enabled = new Set<ModuleKey>(modules ?? ['pos', 'products', 'stock', 'categories', 'reports', 'customers', 'finance', 'expenses_add', 'users', 'branches', 'settings']);
  const has = (m: ModuleKey) => enabled.has(m);
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();
  const initial = (username.trim()[0] || '?').toUpperCase();

  const isActive = (href: string) => isActivePath(pathname, href);

  // Sidebar as an admin-style treeview: top-level links + collapsible groups
  // whose children expand/collapse beneath the parent. The tree itself (and who
  // sees what) is lib/nav.ts.
  const menu = buildNav(has);

  // Which group contains the current route — keep it expanded.
  const activeGroup = menu.find(
    (m): m is Extract<NavItem, { kind: 'group' }> =>
      m.kind === 'group' && m.children.some((c) => isActive(c.href)),
  )?.key;

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroup ? [activeGroup] : []),
  );

  // On navigation, make sure the active route's group is open (never auto-close).
  useEffect(() => {
    if (activeGroup) setOpenGroups((prev) => new Set(prev).add(activeGroup));
  }, [activeGroup]);

  // The shell scrolls inside its body area, so switch off the window scrollbar
  // (otherwise its track still runs alongside the header).
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = 'hidden';
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  // Mobile drawer: stop the page behind it from scrolling while it's open.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [navOpen]);

  // Branch switcher (owner) / current branch label (staff). Lives in the header
  // on wider screens and at the top of the drawer on phones, where the header
  // has no room for it.
  const branchControl = (compact: boolean) =>
    branches.length > 0 &&
    ((canSwitchBranch ?? owner) ? (
      <select
        aria-label={t("Active branch")}
        className="input"
        value={activeScope}
        disabled={switching}
        onChange={(e) => onBranchChange(e.target.value)}
        style={compact ? { height: 38, padding: '0 30px 0 12px', maxWidth: 190, fontSize: 13 } : { height: 44 }}
      >
        <option value={ALL_BRANCHES}>{t("All branches")}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}{b.active ? '' : t(" (closed)")}
          </option>
        ))}
      </select>
    ) : (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg px-3"
        style={{ height: compact ? 38 : 44, background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)', color: 'var(--color-ash)', fontSize: 13 }}
      >
        <Icon name="branch" className="opacity-70" />
        {activeBranchName}
      </span>
    ));

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    // overflow-x: clip is a safety net: anything that ever pokes past the
    // viewport gets cut off instead of making the whole page side-scroll /
    // zoom out on phones. (clip, unlike hidden, keeps the sticky header working.)
    // The page scrolls inside the body area (not the window), so the scrollbar
    // starts below the header instead of running alongside it.
    <div className="h-screen supports-[height:100dvh]:h-[100dvh] flex flex-col overflow-hidden print:!h-auto print:overflow-visible">
      {/* Header */}
      <header
        data-rail={rail || undefined}
        className="no-print sticky top-0 z-30 flex items-center justify-between gap-2 px-4 sm:px-6"
        style={{ background: 'var(--color-ink-2)', minHeight: 64 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 md:hidden">
            <button
              type="button"
              className="hamburger"
              onClick={toggleSidebar}
              data-open={(isDesktop ? !collapsed : navOpen) || undefined}
              aria-expanded={isDesktop ? !collapsed : navOpen}
              aria-label={t("Toggle navigation")}
              title={t("Toggle sidebar (Ctrl+B)")}
            >
              <span className="hamburger__bars" aria-hidden>
                <span /><span /><span />
              </span>
            </button>
          </div>
          <Link href="/" className="flex items-center gap-3 min-w-0" aria-label={storeName}>
            {logoUrl && (
              // The min-width box lets a square logo centre on the same vertical axis as
              // the sidebar icon chips below it (a wide logo just starts at their left edge).
              <span className="shrink-0 flex justify-center md:min-w-[36px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="" style={{ objectFit: 'contain' }} className="shrink-0 h-8 max-w-[88px] sm:h-10 sm:max-w-[132px]" />
              </span>
            )}
            <span className="brand text-[22px] sm:text-[27px] truncate">
              {storeName}
            </span>
          </Link>
        </div>

        {/* Right cluster: branch switcher + theme toggle + profile. On phones
            the branch switcher and fullscreen button move out of the way so
            the bar fits in the screen width. */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">{branchControl(true)}</div>
          <div className="hidden sm:block">
            <FullscreenToggle />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPaletteOpen(true)}
            aria-label={t("Quick search")}
            title={t("Quick search (Ctrl+K)")}
            style={{ padding: 8, width: 38, height: 38 }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <LanguageSwitcher />
          <ThemeToggle />
          <div className="relative">
            <button
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
              style={{ background: menuOpen ? 'var(--color-ink-3)' : 'transparent' }}
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={t("Account menu")}
            >
              <span
                className="grid place-items-center rounded-full font-bold shrink-0"
                style={{
                  width: 34,
                  height: 34,
                  background: 'var(--color-brand)',
                  color: '#000',
                  fontFamily: 'var(--font-head)',
                  fontSize: 16,
                }}
              >
                {initial}
              </span>
              <span className="hidden md:flex flex-col items-start leading-tight">
                <span className="text-[13px] text-strong font-semibold max-w-[170px] truncate">{username}</span>
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{roleLabel}</span>
              </span>
              <Icon name="chevron" className={`hidden sm:block transition-transform${menuOpen ? ' rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <>
                <button
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden
                  tabIndex={-1}
                />
                <div
                  className="absolute right-0 mt-2 w-[220px] z-40 card p-1 animate-pop"
                  style={{ boxShadow: 'var(--shadow-pop)' }}
                >
                  <div className="px-3 py-2 mb-1" style={{ borderBottom: '1px solid var(--color-line)' }}>
                    <div className="text-[13px] text-strong font-semibold truncate">{username}</div>
                    <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{roleLabel}</div>
                  </div>
                  {has('settings') && (
                    <Link href="/settings" className="menu-item" onClick={() => setMenuOpen(false)}>
                      <Icon name="settings" />
                      {t("Settings")}
                    </Link>
                  )}
                  <button type="button" className="menu-item" onClick={changePassword} disabled={pwBusy}>
                    <Icon name="key" />
                    {pwBusy ? t("Sending link…") : t("Change password")}
                  </button>
                  <form action={logoutAction}>
                    <button type="submit" className="menu-item" style={{ color: 'var(--color-brand)' }}>
                      <Icon name="logout" />
                      {t("Log out")}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="app-frame flex-1 min-h-0 overflow-y-auto overflow-x-clip md:flex md:overflow-hidden print:!overflow-visible">
        {navOpen && (
          <button
            className="md:hidden fixed inset-0 z-30 no-print cursor-default"
            style={{ background: 'var(--scrim)' }}
            onClick={() => setNavOpen(false)}
            aria-hidden
            tabIndex={-1}
          />
        )}
        <aside
          data-rail={rail || undefined}
          className={`no-print fixed top-16 left-0 bottom-0 z-40 w-[260px] overflow-y-auto ${
            navOpen ? 'block' : 'hidden'
          } md:static md:block md:z-auto ${rail ? 'md:w-[76px]' : 'md:w-[290px]'} md:transition-[width] md:duration-200 md:shrink-0 md:h-full md:overflow-y-auto`}
          style={{ background: 'var(--color-ink-2)', borderRight: '1px solid var(--color-line)' }}
        >
          {/* Desktop only: the sidebar's own toggle. Open → a close button at the
              right of the heading; collapsed → the hamburger sits on top of the
              icon rail. (Phones keep the header hamburger + drawer.) */}
          <div
            className={`no-print hidden md:flex sticky top-0 z-10 items-center h-[52px] ${rail ? 'justify-center pl-[11px] pr-2' : 'justify-between px-4'}`}
            style={{ background: 'var(--color-ink-2)' }}
          >
            {!rail && <div className="side-label">{t("Main navigation")}</div>}
            {rail ? (
              <button
                type="button"
                className="hamburger"
                onClick={toggleSidebar}
                aria-expanded={false}
                aria-label={t("Open sidebar")}
                title={`${t("Open sidebar")} (Ctrl+B)`}
              >
                <span className="hamburger__bars" aria-hidden>
                  <span /><span /><span />
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="sidebar-close"
                onClick={toggleSidebar}
                aria-expanded
                aria-label={t("Close sidebar")}
                title={`${t("Close sidebar")} (Ctrl+B)`}
              >
                <Icon name="collapse" />
              </button>
            )}
          </div>
          <nav className={`flex flex-col gap-1.5 ${rail ? 'px-2' : 'px-4'} pt-5 md:pt-2 pb-4`}>
            {branches.length > 0 && (
              <div className="sm:hidden flex flex-col gap-2 mb-4">
                <div className="side-label">{t("Branch")}</div>
                {branchControl(false)}
              </div>
            )}
            <div className="side-label md:hidden">{t("Main navigation")}</div>
            {menu.map((item) =>
              item.kind === 'link' ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  className="side-link"
                  title={rail ? t(item.label) : undefined}
                  data-active={isActive(item.href) || undefined}
                >
                  <span className="side-link__icon">
                    <Icon name={item.icon} />
                  </span>
                  <span className="side-text">{t(item.label)}</span>
                </Link>
              ) : (
                <div key={item.key} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    className="side-link"
                    title={rail ? t(item.label) : undefined}
                    data-active={item.children.some((c) => isActive(c.href)) || undefined}
                    aria-expanded={rail ? flyout?.key === item.key : openGroups.has(item.key)}
                    onClick={(e) => {
                      if (rail) {
                        const top = e.currentTarget.getBoundingClientRect().top;
                        setFlyout((f) => (f?.key === item.key ? null : { key: item.key, top }));
                      } else {
                        toggleGroup(item.key);
                      }
                    }}
                  >
                    <span className="side-link__icon">
                      <Icon name={item.icon} />
                    </span>
                    <span className="side-text flex-1 text-left">{t(item.label)}</span>
                    <Icon
                      name="chevron"
                      className={`side-chev ${openGroups.has(item.key) ? 'rotate-180 transition-transform' : 'transition-transform'}`}
                    />
                  </button>
                  {!rail && openGroups.has(item.key) && (
                    <div className="side-sub">
                      {item.children.map((c) => (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={() => setNavOpen(false)}
                          className="side-sublink"
                          data-active={isActive(c.href) || undefined}
                        >
                          <span className="side-sublink__icon">
                            <Icon name={c.icon} />
                          </span>
                          {t(c.label)}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </nav>
        </aside>

        <main
          ref={mainRef}
          className="flex-1 min-w-0 px-4 sm:px-6 pt-6 pb-4 app-pane md:h-full md:overflow-y-auto print:!h-auto print:!overflow-visible"
        >
          {/* min-h-full + flex-1: on short pages the footer card sits at the bottom
              edge; on long pages it follows the content with a small gap. */}
          <div className={`${isWide ? 'max-w-[1400px]' : 'max-w-[1100px]'} mx-auto md:min-h-full flex flex-col`}>
            <div className="flex-1 min-w-0">{children}</div>
            <AppFooter storeName={storeName} logoUrl={logoUrl} branchName={branches.length > 0 ? activeBranchName : ''} />
          </div>
        </main>
      </div>
      {rail && flyout && (() => {
        const group = menu.find((m): m is Extract<NavItem, { kind: 'group' }> => m.kind === 'group' && m.key === flyout.key);
        if (!group) return null;
        return (
          <>
            <button
              className="no-print fixed inset-0 z-40 cursor-default"
              onClick={() => setFlyout(null)}
              aria-hidden
              tabIndex={-1}
            />
            <div
              className="no-print fixed z-50 w-[240px] card p-2 animate-pop overflow-y-auto"
              style={{ left: 84, top: flyout.top, maxHeight: `calc(100vh - ${flyout.top}px - 12px)`, boxShadow: 'var(--shadow-pop)' }}
            >
              <div className="side-label pb-1.5 pt-1">{t(group.label)}</div>
              <div className="flex flex-col gap-1">
                {group.children.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={() => setFlyout(null)}
                    className="side-sublink"
                    data-active={isActive(c.href) || undefined}
                  >
                    <span className="side-sublink__icon">
                      <Icon name={c.icon} />
                    </span>
                    {t(c.label)}
                  </Link>
                ))}
              </div>
            </div>
          </>
        );
      })()}
      {paletteOpen && (
        <CommandPalette
          pages={menu.flatMap((i) => (i.kind === 'link' ? [{ href: i.href, label: i.label }] : i.children.map((c) => ({ href: c.href, label: c.label }))))}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
