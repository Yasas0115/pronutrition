'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModule } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { STAFF_MODULES, type ModuleKey } from '@/lib/modules';
import { logAudit, diffFields } from '@/lib/audit';

export type UserInput = {
  id?: string;
  name: string;
  email: string;
  role: 'OWNER' | 'STAFF';
  title?: string; // free display label, e.g. "Accountant"
  modules?: ModuleKey[]; // granted modules (STAFF only)
  branchId?: string | null;
  password?: string; // required on create; optional reset on edit
};

const STAFF_MODULE_KEYS = new Set<ModuleKey>(STAFF_MODULES.map((m) => m.key));

// Keep only real, staff-assignable module keys.
function cleanModules(mods: ModuleKey[] | undefined): ModuleKey[] {
  return Array.from(new Set((mods ?? []).filter((m) => STAFF_MODULE_KEYS.has(m))));
}

export type UserResult = { ok: true; id: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

function revalidateUsers() {
  revalidatePath('/users');
}

export async function saveUser(input: UserInput): Promise<UserResult> {
  const session = await requireModule('users');
  const actor = { userId: session.userId, userName: session.name };
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email is required.' };
  const isOwner = input.role === 'OWNER';
  const title = (input.title ?? '').trim();
  // Owners see everything (no per-module grants, all branches). Staff get the
  // exact modules the owner ticked; a null branch means all branches.
  const modules = isOwner ? '' : cleanModules(input.modules).join(',');
  const branchId = isOwner ? null : input.branchId || null;
  if (!isOwner && !modules) {
    return { ok: false, error: 'Give this staff member at least one module.' };
  }

  try {
    if (input.id) {
      const data: Record<string, unknown> = {
        name: name || null,
        email,
        role: input.role,
        title: title || null,
        modules,
        branchId,
      };
      if (input.password && input.password.length > 0) {
        if (input.password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
        data.passwordHash = hashPassword(input.password);
      }
      const current = await prisma.user.findUnique({
        where: { id: input.id },
        select: { name: true, email: true, role: true, title: true, modules: true, branchId: true },
      });
      // Never leave the company without an owner (demoting the last owner).
      if (!isOwner && current?.role === 'OWNER') {
        const owners = await prisma.user.count({ where: { role: 'OWNER' } });
        if (owners <= 1) return { ok: false, error: 'There must be at least one owner.' };
      }
      const u = await prisma.user.update({ where: { id: input.id }, data });

      if (current) {
        const pick = (x: { name: string | null; email: string; role: string; title: string | null; modules: string; branchId: string | null }) => ({
          name: x.name, email: x.email, role: x.role, title: x.title, modules: x.modules, branchId: x.branchId,
        });
        const { before, after, changed } = diffFields(pick(current), pick(u));
        const afterOut: Record<string, unknown> = { ...after };
        if (typeof data.passwordHash === 'string') {
          // Never store the hash — just the fact that it happened.
          afterOut.password = '(changed)';
          changed.push('password');
        }
        if (changed.length > 0) {
          const access = changed.some((f) => ['role', 'modules', 'branchId'].includes(f));
          await logAudit(prisma, {
            entity: 'USER',
            entityId: u.id,
            action: access ? 'ACCESS_CHANGE' : 'UPDATE',
            summary: `Edited staff “${u.name || u.email}” — changed ${changed.join(', ')}`,
            before,
            after: afterOut,
            ...actor,
          });
        }
      }
      revalidateUsers();
      return { ok: true, id: u.id };
    }

    if (!input.password || input.password.length < 6) {
      return { ok: false, error: 'Set a password of at least 6 characters.' };
    }
    const u = await prisma.user.create({
      data: {
        name: name || null,
        email,
        role: input.role,
        title: title || null,
        modules,
        branchId,
        passwordHash: hashPassword(input.password),
      },
    });
    await logAudit(prisma, {
      entity: 'USER',
      entityId: u.id,
      action: 'CREATE',
      summary: `Added ${u.role === 'OWNER' ? 'owner' : 'staff'} “${u.name || u.email}”`,
      after: { email: u.email, role: u.role, title: u.title, modules: u.modules, branchId: u.branchId },
      ...actor,
    });
    revalidateUsers();
    return { ok: true, id: u.id };
  } catch {
    return { ok: false, error: 'Could not save the user. That email may already be in use.' };
  }
}

export async function deleteUser(id: string): Promise<SimpleResult> {
  const session = await requireModule('users');
  if (id === session.userId) return { ok: false, error: 'You cannot delete your own account.' };
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!user) return { ok: false, error: 'User not found.' };
    if (user.role === 'OWNER') {
      const owners = await prisma.user.count({ where: { role: 'OWNER' } });
      if (owners <= 1) return { ok: false, error: 'There must be at least one owner.' };
    }
    const gone = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true } });
    // Sales keep their cashier name snapshot; cashierId is set null on delete.
    await prisma.user.delete({ where: { id } });
    await logAudit(prisma, {
      entity: 'USER',
      entityId: id,
      action: 'DELETE',
      summary: `Deleted staff “${gone?.name || gone?.email || id}”`,
      userId: session.userId,
      userName: session.name,
    });
    revalidateUsers();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not delete the user.' };
  }
}
