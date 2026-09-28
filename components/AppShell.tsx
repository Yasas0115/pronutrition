'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Role } from '@/lib/session';
import type { ModuleKey, BranchLite } from '@/lib/modules';
import { ALL_BRANCHES } from '@/lib/modules';
import { logoutAction, switchBranchAction } from '@/app/actions';
import ThemeToggle from './ThemeToggle';
import FullscreenToggle from './FullscreenToggle';

type IconName =
  | 'pos'
  | 'products'
  | 'stock'
  | 'tag'
  | 'store'
  | 'reports'
  | 'sales'
  | 'settings'
  | 'branch'
  | 'users'
  | 'logout'
  | 'chevron'
  | 'menu';

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
      {name === 'reports' && (
        <>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </>
      )}
      {name === 'sales' && (
        <>
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="16" />
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

export default function AppShell({
  username,
  role,
  storeName,
  logoUrl,
  modules,
  branches = [],
  activeScope = ALL_BRANCHES,
  activeBranchName = '',
  wide = false,
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
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();

  function onBranchChange(value: string) {
    startSwitch(async () => {
      await switchBranchAction(value);
      router.refresh();
    });
  }

  const owner = role === 'OWNER';
  const enabled = new Set<ModuleKey>(modules ?? ['pos', 'products', 'stock', 'categories', 'reports', 'users', 'branches', 'settings']);
  const has = (m: ModuleKey) => enabled.has(m);
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();
  const initial = (username.trim()[0] || '?').toUpperCase();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  // Sidebar as an admin-style treeview: top-level links + collapsible groups
  // whose children expand/collapse beneath the parent.
  type NavChild = { href: string; label: string; icon: IconName };
  type NavItem =
    | { kind: 'link'; href: string; label: string; icon: IconName }
    | { kind: 'group'; key: string; label: string; icon: IconName; children: NavChild[] };

  const storeChildren: NavChild[] = [
    ...(has('categories') ? [{ href: '/categories', label: 'Categories', icon: 'tag' as const }] : []),
    // Products & Stock are one page now; show it if the person has either grant.
    ...(has('products') || has('stock')
      ? [{ href: '/products', label: 'Products & Stock', icon: 'stock' as const }]
      : []),
  ];

  const menu: NavItem[] = [
    ...(has('pos') ? [{ kind: 'link' as const, href: '/', label: 'Point of Sale', icon: 'pos' as const }] : []),
    ...(storeChildren.length
      ? [{ kind: 'group' as const, key: 'store', label: 'Store', icon: 'store' as const, children: storeChildren }]
      : []),
    ...(has('reports')
      ? [{ kind: 'link' as const, href: '/sales', label: 'Sales & Reports', icon: 'sales' as const }]
      : []),
    ...(has('branches')
      ? [{ kind: 'link' as const, href: '/branches', label: 'Branches', icon: 'branch' as const }]
      : []),
    ...(has('users')
      ? [{ kind: 'link' as const, href: '/users', label: 'Staff', icon: 'users' as const }]
      : []),
    ...(has('settings')
      ? [{ kind: 'link' as const, href: '/settings', label: 'Settings', icon: 'settings' as const }]
      : []),
  ];

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

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header
        className="no-print sticky top-0 z-30 flex items-center justify-between gap-2 px-4 sm:px-6"
        style={{ background: 'var(--color-ink-2)', minHeight: 64 }}
      >
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setNavOpen((v) => !v)}
              aria-expanded={navOpen}
              aria-label="Toggle navigation"
            >
              <Icon name="menu" />
            </button>
          </div>
          <Link href="/" className="flex items-center gap-3 min-w-0" aria-label={storeName}>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" style={{ height: 40, maxWidth: 132, objectFit: 'contain' }} className="shrink-0" />
            )}
            <span className="brand text-[22px] sm:text-[27px] truncate">
              {storeName}
            </span>
          </Link>
        </div>

        {/* Right cluster: branch switcher + theme toggle + profile */}
        <div className="flex items-center gap-2">
          {branches.length > 0 && (
            owner ? (
              <select
                aria-label="Active branch"
                className="input"
                value={activeScope}
                disabled={switching}
                onChange={(e) => onBranchChange(e.target.value)}
                style={{ height: 38, padding: '0 30px 0 12px', maxWidth: 190, fontSize: 13 }}
              >
                <option value={ALL_BRANCHES}>All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}{b.active ? '' : ' (closed)'}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3"
                style={{ height: 38, background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)', color: 'var(--color-ash)', fontSize: 13 }}
              >
                <Icon name="branch" className="opacity-70" />
                {activeBranchName}
              </span>
            )
          )}
          <FullscreenToggle />
          <ThemeToggle />
          <div className="relative">
            <button
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
              style={{ background: menuOpen ? 'var(--color-ink-3)' : 'transparent' }}
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Account menu"
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
              <span className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-[13px] text-strong font-semibold max-w-[170px] truncate">{username}</span>
                <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{roleLabel}</span>
              </span>
              <Icon name="chevron" className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
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
                      Settings
                    </Link>
                  )}
                  <form action={logoutAction}>
                    <button type="submit" className="menu-item" style={{ color: 'var(--color-brand)' }}>
                      <Icon name="logout" />
                      Log out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex-1 md:flex">
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
          className={`no-print fixed top-16 left-0 bottom-0 z-40 w-[260px] overflow-y-auto ${
            navOpen ? 'block' : 'hidden'
          } md:static md:block md:z-auto md:w-[290px] md:shrink-0 md:overflow-visible`}
          style={{ background: 'var(--color-ink-2)', borderRight: '1px solid var(--color-line)' }}
        >
          <nav className="flex flex-col gap-1.5 px-4 pt-10 pb-4 md:sticky md:top-16">
            <div className="side-label">Main navigation</div>
            {menu.map((item) =>
              item.kind === 'link' ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  className="side-link"
                  data-active={isActive(item.href) || undefined}
                >
                  <span className="side-link__icon">
                    <Icon name={item.icon} />
                  </span>
                  {item.label}
                </Link>
              ) : (
                <div key={item.key} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    className="side-link"
                    data-active={item.children.some((c) => isActive(c.href)) || undefined}
                    aria-expanded={openGroups.has(item.key)}
                    onClick={() => toggleGroup(item.key)}
                  >
                    <span className="side-link__icon">
                      <Icon name={item.icon} />
                    </span>
                    <span className="flex-1 text-left">{item.label}</span>
                    <Icon
                      name="chevron"
                      className={openGroups.has(item.key) ? 'rotate-180 transition-transform' : 'transition-transform'}
                    />
                  </button>
                  {openGroups.has(item.key) && (
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
                          {c.label}
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
          className="flex-1 min-w-0 px-4 sm:px-6 pt-6 pb-20 lg:pb-6"
          style={{ borderTop: '1px solid var(--color-line)' }}
        >
          <div className={wide ? 'max-w-[1400px] mx-auto' : 'max-w-[1100px] mx-auto'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
