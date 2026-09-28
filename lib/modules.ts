// Pure, client-safe constants & types shared by both server and client code.
// Kept free of server-only imports (no next/headers, no prisma) so client
// components can import ALL_MODULES / ALL_BRANCHES without pulling server code
// into the browser bundle.

export const ALL_BRANCHES = 'all';

export type BranchLite = { id: string; name: string; code: string | null; active: boolean };

export type ModuleKey =
  | 'pos'
  | 'products'
  | 'stock'
  | 'categories'
  | 'reports'
  | 'users'
  | 'branches'
  | 'settings';

export const ALL_MODULES: { key: ModuleKey; label: string; locked?: boolean }[] = [
  { key: 'pos', label: 'Point of Sale', locked: true },
  { key: 'products', label: 'Products & inventory' },
  { key: 'stock', label: 'Stock control' },
  { key: 'categories', label: 'Categories' },
  { key: 'reports', label: 'Sales & reports' },
  { key: 'branches', label: 'Branches' },
  { key: 'users', label: 'Staff / users' },
  { key: 'settings', label: 'Settings', locked: true },
];

// Modules an owner can grant to an individual staff member. Everything except
// Settings, which stays owner-only (it holds the company-wide module switch and
// billing-sensitive config).
export const STAFF_MODULES: { key: ModuleKey; label: string }[] = ALL_MODULES
  .filter((m) => m.key !== 'settings')
  .map(({ key, label }) => ({ key, label }));

// Company-wide master switch. POS and Settings are always on so the app is
// never left unusable for the owner.
export function parseModules(raw: string | null | undefined): Set<ModuleKey> {
  const keys = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as ModuleKey[];
  const set = new Set<ModuleKey>(keys);
  set.add('pos');
  set.add('settings');
  return set;
}

// A single staff member's granted modules — taken literally, nothing forced on.
// A legacy staff row with no grants falls back to POS so old cashiers still work.
export function parseUserModules(raw: string | null | undefined): Set<ModuleKey> {
  const set = new Set<ModuleKey>(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as ModuleKey[],
  );
  if (set.size === 0) set.add('pos');
  return set;
}

// What a signed-in person may actually open: the owner gets every company-enabled
// module; a staff member gets the intersection of company-enabled and their own
// grants (never Settings, which is owner-only).
export function effectiveModules(
  role: 'OWNER' | 'STAFF',
  companyEnabled: Set<ModuleKey>,
  userGrants: Set<ModuleKey>,
): Set<ModuleKey> {
  if (role === 'OWNER') return companyEnabled;
  const eff = new Set<ModuleKey>();
  for (const k of userGrants) if (k !== 'settings' && companyEnabled.has(k)) eff.add(k);
  return eff;
}

// Where each module lives, plus the order we prefer to land a staff member on
// when they open a page they cannot access.
export const MODULE_ROUTES: Record<ModuleKey, string> = {
  pos: '/',
  products: '/products',
  stock: '/stock',
  categories: '/categories',
  reports: '/sales',
  branches: '/branches',
  users: '/users',
  settings: '/settings',
};

const LANDING_PRIORITY: ModuleKey[] = ['pos', 'reports', 'products', 'stock', 'categories', 'branches', 'users'];

export function landingRoute(eff: Set<ModuleKey>): string {
  for (const k of LANDING_PRIORITY) if (eff.has(k)) return MODULE_ROUTES[k];
  return '/login';
}
