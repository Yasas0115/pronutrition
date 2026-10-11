// Integration check for Phase 4 (passwords): the whole emailed-link flow against
// the real database, with a tiny fake SMTP server standing in for the mail
// provider — so a real email is composed, sent and parsed, no mailbox needed.
// Run: pnpm exec tsx scripts/verify-password.ts
import net from 'node:net';
import { prisma } from '../lib/db';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  requestPasswordReset,
  sendResetLinkToUser,
  checkResetToken,
  completePasswordReset,
  sha256,
  RESET_TTL_MS,
} from '../lib/password-reset';
import { allow } from '../lib/rate-limit';
import { assert, failureCount } from './fixtures';

type Mail = { to: string; data: string };

// Minimal SMTP receiver: just enough of the protocol for nodemailer to deliver.
function startSink(): Promise<{ port: number; mails: Mail[]; close: () => Promise<void> }> {
  const mails: Mail[] = [];
  const server = net.createServer((sock) => {
    sock.write('220 sink ESMTP\r\n');
    let buf = '';
    let inData = false;
    let to: string[] = [];
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end === -1) break;
          mails.push({ to: to.join(','), data: buf.slice(0, end) });
          buf = buf.slice(end + 5);
          inData = false;
          to = [];
          sock.write('250 OK queued\r\n');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl === -1) break;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const up = line.toUpperCase();
        if (up.startsWith('EHLO') || up.startsWith('HELO')) sock.write('250-sink\r\n250 8BITMIME\r\n');
        else if (up.startsWith('RCPT TO')) { to.push(line.slice(line.indexOf('<') + 1, line.indexOf('>'))); sock.write('250 OK\r\n'); }
        else if (up === 'DATA') { inData = true; sock.write('354 go ahead\r\n'); }
        else if (up === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, mails, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// Mail bodies are quoted-printable (long lines are soft-wrapped with "=" and
// "=" itself is "=3D"), so undo that before looking for the link.
const qpDecode = (s: string) =>
  s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

const tokenFrom = (m: Mail) => /reset-password\?token=([A-Za-z0-9_-]+)/.exec(qpDecode(m.data))?.[1] ?? null;

async function waitFor(cond: () => boolean, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
}

async function main() {
  const sink = await startSink();
  const saved = { ...process.env };
  const email = `verify-reset-${Date.now()}@test.local`;
  const user = await prisma.user.create({
    data: { email, name: 'Verify Person', role: 'STAFF', modules: 'pos', passwordHash: hashPassword('OldPassw0rd') },
  });

  const setMail = (port: number | null) => {
    if (port === null) {
      delete process.env.SMTP_HOST; delete process.env.MAIL_FROM; delete process.env.APP_URL;
    } else {
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_PORT = String(port);
      process.env.SMTP_SECURE = 'false';
      process.env.MAIL_FROM = 'Pro Nutrition <noreply@test.local>';
      process.env.APP_URL = 'https://pos.example.test/';
      delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
    }
  };

  try {
    // -------------------------------------------------- not configured
    console.log('\n▶ Email not set up');
    setMail(null);
    const unconfigured = await requestPasswordReset(email);
    assert(!unconfigured.ok && /not set up/i.test(unconfigured.error), 'a clear "email is not set up" message is returned');
    assert((await prisma.passwordResetToken.count({ where: { userId: user.id } })) === 0, 'and no token is created');

    // -------------------------------------------------- the round trip
    console.log('\n▶ Forgot password → email → link');
    setMail(sink.port);

    const unknown = await requestPasswordReset('nobody-here@test.local');
    assert(unknown.ok, 'an unknown email gets the same "ok" answer (no account discovery)');
    await new Promise((r) => setTimeout(r, 400));
    assert(sink.mails.length === 0, 'and no email is sent for it');

    const known = await requestPasswordReset(email.toUpperCase());
    assert(known.ok, 'a registered email (any letter case) gets "ok"');
    assert(await waitFor(() => sink.mails.length === 1), 'one email arrives at the mail server');
    const mail1 = sink.mails[0];
    const token1 = tokenFrom(mail1);
    assert(mail1.to === email, 'it is addressed to the account holder');
    assert(!!token1 && token1.length >= 40, 'the email contains a long random token');
    assert(qpDecode(mail1.data).includes('https://pos.example.test/reset-password?token='),
      'the link is built from APP_URL (not from the request) with the trailing slash tidied');

    const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    assert(row.tokenHash === sha256(token1!) && row.tokenHash !== token1, 'only the SHA-256 of the token is stored, never the token');
    const life = row.expiresAt.getTime() - row.createdAt.getTime();
    assert(Math.abs(life - RESET_TTL_MS) < 5000, 'the link lives 30 minutes');

    assert((await checkResetToken(token1)).ok, 'the token checks out');
    assert(!(await checkResetToken('x'.repeat(43))).ok, 'a made-up token does not');

    // ---------------------------------------- newer link retires older
    console.log('\n▶ A newer link replaces the older one');
    await requestPasswordReset(email);
    assert(await waitFor(() => sink.mails.length === 2), 'a second email is sent');
    const token2 = tokenFrom(sink.mails[1])!;
    // The older link is retired just after delivery completes — give it a moment.
    let old = await checkResetToken(token1);
    for (let i = 0; i < 40 && old.ok; i++) {
      await new Promise((r) => setTimeout(r, 50));
      old = await checkResetToken(token1);
    }
    assert(!old.ok && old.reason === 'used', 'the first link no longer works');
    assert((await checkResetToken(token2)).ok, 'the second link does');

    // ------------------------------------------------- set a password
    console.log('\n▶ Setting the new password');
    const short = await completePasswordReset(token2, 'short');
    assert(!short.ok && /at least 8/.test(short.error), 'a short password is refused');
    assert((await checkResetToken(token2)).ok, 'and the link survives a refused attempt');

    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(before.passwordChangedAt === null, 'passwordChangedAt starts empty');
    const done = await completePasswordReset(token2, 'NewPassw0rd!');
    assert(done.ok, 'a good password is accepted');
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert(verifyPassword('NewPassw0rd!', after.passwordHash), 'the new password verifies');
    assert(!verifyPassword('OldPassw0rd', after.passwordHash), 'the old password no longer does');
    assert(!!after.passwordChangedAt, 'passwordChangedAt is stamped (this signs out every older session)');

    const again = await completePasswordReset(token2, 'AnotherPassw0rd!');
    assert(!again.ok && /already been used/.test(again.error), 'the same link cannot be used twice');
    assert(verifyPassword('NewPassw0rd!', (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash),
      'and the second attempt changed nothing');

    // ---------------------------------------------------------- expiry
    console.log('\n▶ Expiry');
    const stale = 'e'.repeat(43);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(stale), expiresAt: new Date(Date.now() - 60_000) },
    });
    const exp = await checkResetToken(stale);
    assert(!exp.ok && exp.reason === 'expired', 'an old link reports "expired"');
    const expDone = await completePasswordReset(stale, 'WontWork12345');
    assert(!expDone.ok && /expired/i.test(expDone.error), 'and cannot be used to set a password');
    assert(verifyPassword('NewPassw0rd!', (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash),
      'the password is unchanged');

    // ------------------------------------- signed-in senders & errors
    console.log('\n▶ Owner / self-service sending');
    const sentBefore = sink.mails.length;
    const sent = await sendResetLinkToUser(user.id, 'Owner Test');
    assert(sent.ok && sent.email === email, 'a signed-in person gets the real result back (the address it went to)');
    assert(await waitFor(() => sink.mails.length === sentBefore + 1), 'and the email goes out');

    setMail(1); // a port nothing listens on
    const broken = await sendResetLinkToUser(user.id, 'Owner Test');
    assert(!broken.ok && /Could not send/i.test(broken.error), 'a dead mail server is reported, not swallowed');
    const live = await prisma.passwordResetToken.count({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } } });
    assert(live === 1, `the undeliverable link was retired — only the one real link is live (${live})`);
    setMail(sink.port);

    // --------------------------------------------------- throttling
    console.log('\n▶ Throttling');
    let throttled = false;
    for (let i = 0; i < 8 && !throttled; i++) {
      const r = await sendResetLinkToUser(user.id, 'Owner Test');
      if (!r.ok && /Too many/i.test(r.error)) throttled = true;
    }
    assert(throttled, 'asking for link after link is cut off for the account (5 an hour)');

    let blockedAt = 0;
    for (let i = 1; i <= 12; i++) if (!allow('verify:ip', 10, 60_000)) { blockedAt = i; break; }
    assert(blockedAt === 11, `the form's per-visitor limiter allows 10 then blocks (blocked at call ${blockedAt})`);

    const audits = await prisma.auditLog.count({ where: { entity: 'USER', entityId: user.id } });
    assert(audits >= 2, `the reset and the emailed links are in the activity log (${audits})`);
  } finally {
    console.log('\n▶ Cleanup');
    Object.assign(process.env, saved);
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'MAIL_FROM', 'APP_URL']) if (!(k in saved)) delete process.env[k];
    await prisma.auditLog.deleteMany({ where: { entity: 'USER', entityId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }); // tokens cascade
    await sink.close();
  }

  const bad = failureCount();
  console.log(bad === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${bad} CHECK(S) FAILED\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
