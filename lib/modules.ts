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
  | 'customers'
  | 'finance'
  | 'expenses_add'
  | 'users'
  | 'branches'
  | 'settings';

export const ALL_MODULES: { key: ModuleKey; label: string; locked?: boolean }[] = [
  { key: 'pos', label: 'Point of Sale', locked: true },
  { key: 'products', label: 'Products & inventory' },
  { key: 'stock', label: 'Stock control' },
  { key: 'categories', label: 'Categories' },
  // Accounting › Sales: takings, best sellers, receipts, sales mix.
  { key: 'reports', label: 'Accounting: Sales & takings' },
  // The customer directory, plus Accounting › Receivables (who owes, collect payments).
  { key: 'customers', label: 'Customers + Accounting: Receivables' },
  // Accountant-level: expenses, payroll, profit, cash drawer, buying prices,
  // stock value, price history, activity log.
  { key: 'finance', label: 'Accounting: Expenses, profit & buying prices' },
  // Lighter than `finance`: a worker who may only record expenses (and see their own entries).
  { key: 'expenses_add', label: 'Add expenses only (no reports)' },
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

// How the Add/Edit user dialog presents the grantable modules: grouped, with a
// plain-language description, a short name for the "will see" summary, and a
// flag for the ones that expose money or people.
export type ModuleUi = {
  key: ModuleKey;
  short: string;
  description: string;
  sensitive?: boolean;
};

export const MODULE_GROUPS: { title: string; items: ModuleUi[] }[] = [
  {
    title: 'Selling',
    items: [
      { key: 'pos', short: 'Till', description: 'The till: ring up sales and print bills.' },
    ],
  },
  {
    title: 'Store',
    items: [
      { key: 'products', short: 'Products', description: 'View, add and edit products.' },
      { key: 'stock', short: 'Stock', description: 'See stock levels and adjust quantities.' },
      { key: 'categories', short: 'Categories', description: 'Create and edit product categories.' },
    ],
  },
  {
    title: 'Customers & money in',
    items: [
      { key: 'customers', short: 'Customers & receivables', description: 'Customer list, plus who owes money and collecting payments.' },
      { key: 'reports', short: 'Sales', description: 'Daily takings, best sellers, receipts, sales mix.' },
    ],
  },
  {
    title: 'Money out',
    items: [
      { key: 'expenses_add', short: 'Add expenses', description: 'Can record expenses and see only their own entries. No reports, salaries or profit.' },
      { key: 'finance', short: 'Full finance', description: 'Everything financial: all expenses, salaries, profit, cash drawer, buying prices, stock value.', sensitive: true },
    ],
  },
  {
    title: 'Administration',
    items: [
      { key: 'branches', short: 'Branches', description: 'Add and manage branches.' },
      { key: 'users', short: 'Staff', description: 'Add, edit and remove other users.', sensitive: true },
    ],
  },
];

// One-click starting points in the Add/Edit user dialog.
export const ROLE_PRESETS: { id: string; label: string; modules: ModuleKey[] }[] = [
  { id: 'cashier', label: 'Cashier', modules: ['pos'] },
  { id: 'cashier-plus', label: 'Cashier + expenses', modules: ['pos', 'customers', 'expenses_add'] },
  { id: 'stock', label: 'Stock keeper', modules: ['products', 'stock', 'categories'] },
  { id: 'manager', label: 'Manager', modules: ['pos', 'products', 'stock', 'categories', 'reports', 'customers'] },
  { id: 'accountant', label: 'Accountant', modules: ['reports', 'customers', 'finance'] },
];

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
  reports: '/accounting/sales',
  customers: '/customers',
  finance: '/accounting/profit',
  expenses_add: '/accounting/expenses',
  branches: '/branches',
  users: '/users',
  settings: '/settings',
};

const LANDING_PRIORITY: ModuleKey[] = ['pos', 'reports', 'customers', 'finance', 'expenses_add', 'products', 'stock', 'categories', 'branches', 'users'];

export function landingRoute(eff: Set<ModuleKey>): string {
  for (const k of LANDING_PRIORITY) if (eff.has(k)) return MODULE_ROUTES[k];
  return '/login';
}
