// The sidebar as data. Pure and client-safe (no Prisma, no next/headers) so the
// shell renders it and scripts/verify-perms.ts can assert who sees what.
//
// Rule of the app: every money total / list / history lives under Accounting.
// The till (POS) and the price input boxes are the only other places an amount
// appears, because the job cannot be done without them.
import type { ModuleKey } from './modules';

export type NavIcon =
  | 'pos' | 'store' | 'tag' | 'stock' | 'customer' | 'accounts' | 'sales' | 'receipt'
  | 'wallet' | 'trend' | 'products' | 'list' | 'shield' | 'branch' | 'users' | 'settings';

export type NavChild = { href: string; label: string; icon: NavIcon };
export type NavItem =
  | { kind: 'link'; href: string; label: string; icon: NavIcon }
  | { kind: 'group'; key: string; label: string; icon: NavIcon; children: NavChild[] };

export function buildNav(has: (m: ModuleKey) => boolean): NavItem[] {
  const group = (key: string, label: string, icon: NavIcon, children: (NavChild | false)[]): NavItem[] => {
    const kids = children.filter((c): c is NavChild => c !== false);
    return kids.length ? [{ kind: 'group', key, label, icon, children: kids }] : [];
  };

  return [
    ...(has('pos') ? [{ kind: 'link' as const, href: '/', label: 'Point of Sale', icon: 'pos' as const }] : []),

    ...group('store', 'Store', 'store', [
      // Products & Stock are one page; either grant opens it.
      (has('products') || has('stock')) && { href: '/products', label: 'Products & Stock', icon: 'stock' },
      has('categories') && { href: '/categories', label: 'Categories', icon: 'tag' },
    ]),

    // The customer directory: names, phones, addresses. What they owe is in
    // Accounting › Receivables.
    ...(has('customers')
      ? [{ kind: 'link' as const, href: '/customers', label: 'Customers', icon: 'customer' as const }]
      : []),

    ...group('accounting', 'Accounting', 'accounts', [
      has('reports') && { href: '/accounting/sales', label: 'Sales', icon: 'sales' },
      has('customers') && { href: '/accounting/receivables', label: 'Receivables', icon: 'receipt' },
      has('finance') && { href: '/accounting/expenses', label: 'Expenses & Payroll', icon: 'wallet' },
      has('finance') && { href: '/accounting/profit', label: 'Profit & Cash', icon: 'trend' },
      has('finance') && { href: '/accounting/stock-value', label: 'Stock value', icon: 'products' },
      has('finance') && { href: '/accounting/activity', label: 'Activity log', icon: 'list' },
    ]),

    ...group('admin', 'Administration', 'shield', [
      has('branches') && { href: '/branches', label: 'Branches', icon: 'branch' },
      has('users') && { href: '/users', label: 'Staff', icon: 'users' },
      has('settings') && { href: '/settings', label: 'Settings', icon: 'settings' },
    ]),
  ];
}

/** Is `href` the current page, or a page inside it? ('/' only matches itself.) */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
