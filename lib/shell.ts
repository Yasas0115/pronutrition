// Common data every page needs for the AppShell chrome: store identity, the
// branch list + active branch (for the owner's switcher), and which modules are
// enabled (for gating the sidebar).
import { prisma } from './db';
import type { Session } from './session';
import {
  getActiveScope,
  getEffectiveModules,
  listBranches,
  ALL_BRANCHES,
  type BranchLite,
  type ModuleKey,
} from './branch';

export type ShellProps = {
  username: string;
  role: Session['role'];
  storeName: string;
  logoUrl: string | null;
  modules: ModuleKey[];
  branches: BranchLite[];
  activeScope: string; // branch id or ALL_BRANCHES
  activeBranchName: string;
};

export async function getShellProps(session: Session): Promise<ShellProps> {
  const [store, branches, scope, effective] = await Promise.all([
    prisma.store.findFirst(),
    listBranches(),
    getActiveScope(session),
    getEffectiveModules(session),
  ]);
  const modules = Array.from(effective);
  const activeBranchName =
    scope === ALL_BRANCHES
      ? 'All branches'
      : branches.find((b) => b.id === scope)?.name ?? 'Branch';

  return {
    username: session.name,
    role: session.role,
    storeName: store?.name ?? 'Pro Nutrition',
    logoUrl: store?.logoUrl ?? null,
    modules,
    branches,
    activeScope: scope,
    activeBranchName,
  };
}
