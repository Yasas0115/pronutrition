// Active-branch resolution + module gating, shared by pages and server actions.
//
// A CASHIER is pinned to their assigned branch. An OWNER can switch the "active
// branch" freely; the choice is kept in a cookie (`pn_branch`) and may be a
// branch id or the sentinel `ALL_BRANCHES` for company-wide reports.
import { cookies } from 'next/headers';
import { prisma } from './db';
import type { Session } from './session';
import {
  ALL_BRANCHES,
  ALL_MODULES,
  parseUserModules,
  effectiveModules,
  type BranchLite,
  type ModuleKey,
} from './modules';

export const BRANCH_COOKIE = 'pn_branch';
// Re-export the client-safe bits so existing server imports from '@/lib/branch'
// keep working.
export { ALL_BRANCHES, parseModules, ALL_MODULES, STAFF_MODULES } from './modules';
export type { BranchLite, ModuleKey } from './modules';

export async function listBranches(activeOnly = false): Promise<BranchLite[]> {
  const rows = await prisma.branch.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, code: true, active: true },
  });
  return rows;
}

// The owner's chosen scope: a concrete branch id, or ALL_BRANCHES. Cashiers are
// always locked to their own branch regardless of the cookie.
export async function getActiveScope(session: Session): Promise<string> {
  if (session.role !== 'OWNER') {
    return session.branchId ?? ALL_BRANCHES;
  }
  const raw = (await cookies()).get(BRANCH_COOKIE)?.value;
  if (raw === ALL_BRANCHES) return ALL_BRANCHES;
  if (raw) {
    const exists = await prisma.branch.findUnique({ where: { id: raw }, select: { id: true } });
    if (exists) return raw;
  }
  // Default the owner to their first active branch (nice for the till/dashboard).
  const first = await prisma.branch.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return first?.id ?? ALL_BRANCHES;
}

// A concrete branch id for actions that must target one branch (the till,
// per-branch stock edits). When the owner is on "All branches", fall back to
// the first active branch so selling is always possible.
export async function getTillBranchId(session: Session): Promise<string | null> {
  const scope = await getActiveScope(session);
  if (scope !== ALL_BRANCHES) return scope;
  const first = await prisma.branch.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return first?.id ?? null;
}

export async function setActiveScopeCookie(value: string): Promise<void> {
  const store = await cookies();
  store.set(BRANCH_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

// ---------- Module gating ----------
// Every module is enabled company-wide. Access is controlled per user (the
// grants picked when adding/editing a staff member), not by a global switch.
export async function getEnabledModules(): Promise<Set<ModuleKey>> {
  return new Set<ModuleKey>(ALL_MODULES.map((m) => m.key));
}

// What THIS person may open: owner = every company-enabled module; staff = the
// intersection of company-enabled modules and their own grants (read fresh from
// the DB so edits take effect without a re-login).
export async function getEffectiveModules(session: Session): Promise<Set<ModuleKey>> {
  const companyEnabled = await getEnabledModules();
  if (session.role === 'OWNER') return companyEnabled;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { modules: true },
  });
  return effectiveModules('STAFF', companyEnabled, parseUserModules(user?.modules));
}
