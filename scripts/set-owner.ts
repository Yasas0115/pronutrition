// Creates an OWNER login, or resets an existing user's password and makes them
// OWNER (all branches). For when nobody can sign in to add users from the UI.
// Run: pnpm exec tsx scripts/set-owner.ts                       (list users)
//      pnpm exec tsx scripts/set-owner.ts <email> <password> [name]
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password';
const prisma = new PrismaClient();

async function main() {
  const [emailArg, password, name] = process.argv.slice(2);

  if (!emailArg) {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    if (!users.length) console.log('No users yet.');
    users.forEach((u) => console.log(`${u.role.padEnd(6)} ${u.email}  (${u.name ?? '-'})`));
    return;
  }

  const email = emailArg.trim().toLowerCase();
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

  const passwordHash = hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'OWNER', branchId: null, ...(name ? { name } : {}) },
    create: { email, passwordHash, role: 'OWNER', branchId: null, name: name || 'Owner' },
  });
  console.log(`OK: ${user.email} is an OWNER and can sign in with the new password.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
