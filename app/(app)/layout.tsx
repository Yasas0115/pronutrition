import { requireSession } from '@/lib/auth';
import { getShellProps } from '@/lib/shell';
import AppShell from '@/components/AppShell';

export const dynamic = 'force-dynamic';

// Shared chrome for every signed-in page (header, sidebar, branch switcher).
// Next keeps a layout mounted while you move between its pages, so clicking a
// menu item only swaps the content area instead of redrawing the whole shell.
// Each page still guards itself with requireModule(); this layout only needs
// to know who is signed in.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const shell = await getShellProps(session);
  return <AppShell {...shell}>{children}</AppShell>;
}
