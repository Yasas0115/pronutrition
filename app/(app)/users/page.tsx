import { requireModule } from '@/lib/auth';
import { normalizeRole } from '@/lib/session';
import { prisma } from '@/lib/db';
import UsersView from '@/components/UsersView';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await requireModule('users');
  const [users, branches] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: 'asc' }, { createdAt: 'asc' }], include: { branch: { select: { name: true } } } }),
    prisma.branch.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
  ]);

  const items = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: normalizeRole(u.role),
    title: u.title,
    modules: u.modules,
    branchId: u.branchId,
    branchName: u.branch?.name ?? null,
  }));

  return (
    <>
      <UsersView users={items} branches={branches} currentUserId={session.userId} />
    </>
  );
}
