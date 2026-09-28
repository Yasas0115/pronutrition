// Verifies the per-user module permission logic + a DB round-trip for the new
// User.title / User.modules columns. Self-cleaning. Run:
//   pnpm exec tsx scripts/verify-perms.ts
import { PrismaClient } from '@prisma/client';
import {
  effectiveModules,
  parseUserModules,
  parseModules,
  landingRoute,
  STAFF_MODULES,
} from '@/lib/modules';

const prisma = new PrismaClient();
let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}
const setEq = (a: Set<string>, b: string[]) =>
  a.size === b.length && b.every((x) => a.has(x));

async function main() {
  const company = parseModules('pos,products,categories,reports,users,branches,settings');

  const owner = effectiveModules('OWNER', company, new Set());
  check('owner sees all company modules', setEq(owner, Array.from(company)));

  const acc = effectiveModules('STAFF', company, parseUserModules('reports'));
  check('accountant sees only reports', setEq(acc, ['reports']));
  check('accountant landing route is /sales', landingRoute(acc) === '/sales');

  const cashier = effectiveModules('STAFF', company, parseUserModules('pos,products'));
  check('cashier sees pos + products', setEq(cashier, ['pos', 'products']));
  check('cashier landing route is /', landingRoute(cashier) === '/');

  const sneaky = effectiveModules('STAFF', company, parseUserModules('settings,reports'));
  check('staff never gets settings', !sneaky.has('settings'));

  const noReports = parseModules('pos,products');
  const staffNoReports = effectiveModules('STAFF', noReports, parseUserModules('reports'));
  check('company-disabled module is hidden from staff', staffNoReports.size === 0);

  const legacy = parseUserModules('');
  check('legacy empty grants -> pos', setEq(legacy, ['pos']));

  check('settings not offered to staff', !STAFF_MODULES.some((m) => m.key === 'settings'));

  const email = `verify-acc-${Date.now()}@example.test`;
  const created = await prisma.user.create({
    data: { email, name: 'Verify Accountant', role: 'STAFF', title: 'Accountant', modules: 'reports', branchId: null, passwordHash: 'x' },
  });
  const read = await prisma.user.findUnique({ where: { id: created.id }, select: { role: true, title: true, modules: true, branchId: true } });
  check('DB stored title=Accountant', read?.title === 'Accountant');
  check('DB stored modules=reports', read?.modules === 'reports');
  check('DB stored role=STAFF, all branches', read?.role === 'STAFF' && read?.branchId === null);
  const eff = effectiveModules('STAFF', company, parseUserModules(read?.modules as string));
  check('round-trip effective = reports only', setEq(eff, ['reports']));
  await prisma.user.delete({ where: { id: created.id } });
  console.log('- cleaned up temp user');

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
