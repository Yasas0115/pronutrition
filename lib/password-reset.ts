// Password changes happen ONLY through an emailed one-time link.
//
//   • The token is 32 random bytes; the database stores just its SHA-256, so a
//     leaked table can't be turned into working links.
//   • A link works once and expires after 30 minutes. Asking for a new link
//     invalidates the older ones.
//   • Completing a reset stamps User.passwordChangedAt, which makes every
//     session signed in before that moment invalid (see lib/auth.ts).
//   • The public "forgot password" path never says whether an email is
//     registered, so it can't be used to discover who has an account.
//
// Kept out of the server actions so it can be tested directly.
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db';
import { hashPassword } from './password';
import { logAudit } from './audit';
import { mailConfig, sendMail, MailNotConfiguredError } from './mail';

export const RESET_TTL_MS = 30 * 60 * 1000;
export const MIN_NEW_PASSWORD = 8;
const MAX_NEW_PASSWORD = 200; // scrypt is deliberately slow — don't let it be fed megabytes
const MAX_LINKS_PER_HOUR = 5;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------ token check
export type TokenCheck =
  | { ok: true; email: string; name: string | null }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

export const TOKEN_PROBLEM: Record<'invalid' | 'expired' | 'used', string> = {
  invalid: 'This link is not valid. Ask for a new one.',
  expired: 'This link has expired (links last 30 minutes). Ask for a new one.',
  used: 'This link has already been used. If you still need to change the password, ask for a new one.',
};

export async function checkResetToken(token: string | null | undefined): Promise<TokenCheck> {
  if (!token || token.length < 20 || token.length > 200) return { ok: false, reason: 'invalid' };
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.usedAt) return { ok: false, reason: 'used' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, email: row.user.email, name: row.user.name };
}

// ------------------------------------------------------------ issuing
// Returns null when this account has already had too many links this hour.
async function issueToken(userId: string, requestedByName: string): Promise<{ token: string; expiresAt: Date } | null> {
  const recent = await prisma.passwordResetToken.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= MAX_LINKS_PER_HOUR) return null;

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt, requestedByName },
  });
  return { token, expiresAt };
}

// A newer link replaces the older ones — but only once it has really been
// delivered. If the mail server is down, the link the person already holds keeps
// working instead of being thrown away for nothing.
async function retireOtherLinks(userId: string, keepToken: string): Promise<void> {
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null, tokenHash: { not: sha256(keepToken) } },
    data: { usedAt: new Date() },
  });
}

// The link we just made could not be delivered — it must not stay redeemable.
async function discardLink(token: string): Promise<void> {
  await prisma.passwordResetToken.updateMany({ where: { tokenHash: sha256(token) }, data: { usedAt: new Date() } });
}

async function emailLink(user: { email: string; name: string | null }, token: string): Promise<void> {
  const cfg = mailConfig();
  if (!cfg) throw new MailNotConfiguredError();
  const store = await prisma.store.findFirst({ select: { name: true } });
  const shop = store?.name ?? 'Pro Nutrition';
  const link = `${cfg.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const hello = user.name ? `Hi ${user.name},` : 'Hi,';

  const text = [
    hello,
    '',
    `Use this link to set a new password for ${shop}:`,
    link,
    '',
    'The link works once and expires in 30 minutes.',
    "If you didn't ask for this, you can ignore this email — your password stays the same.",
  ].join('\n');

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const html = `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 16px">${esc(shop)}</h2>
    <p>${esc(hello)}</p>
    <p>Use the button below to set a new password.</p>
    <p style="margin:24px 0"><a href="${esc(link)}" style="background:#EF4444;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Set a new password</a></p>
    <p style="font-size:13px;color:#555">Or paste this address into your browser:<br><span style="word-break:break-all">${esc(link)}</span></p>
    <p style="font-size:13px;color:#555">The link works once and expires in 30 minutes. If you didn't ask for this, ignore this email — your password stays the same.</p>
  </body></html>`;

  await sendMail({ to: user.email, subject: `Set a new password for ${shop}`, text, html });
}

// ------------------------------------------------- public: "forgot password"
export type RequestResult = { ok: true } | { ok: false; error: string };

// Always answers the same way for a registered and an unknown email. The send
// itself runs in the background so the response time doesn't give it away either.
export async function requestPasswordReset(emailRaw: string): Promise<RequestResult> {
  if (!mailConfig()) return { ok: false, error: new MailNotConfiguredError().message };

  const email = (emailRaw ?? '').trim().toLowerCase();
  if (!email || email.length > 254) return { ok: true };

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (!user) return { ok: true };

  const issued = await issueToken(user.id, 'the user (forgot password)');
  if (!issued) return { ok: true }; // throttled — stay silent

  void emailLink(user, issued.token)
    .then(() => retireOtherLinks(user.id, issued.token))
    .catch(async (e) => {
      // Never log the token or the link, only that it failed and why.
      console.error('[password-reset] could not send email:', e instanceof Error ? e.message : e);
      await discardLink(issued.token).catch(() => {});
    });
  return { ok: true };
}

// ------------------------------- signed in: change my own / reset someone's
export type SendResult = { ok: true; email: string } | { ok: false; error: string };

// Here the caller is authenticated, so they get the real outcome (including a
// mail-server failure) instead of the deliberately vague public answer.
export async function sendResetLinkToUser(userId: string, requestedByName: string): Promise<SendResult> {
  if (!mailConfig()) return { ok: false, error: new MailNotConfiguredError().message };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user) return { ok: false, error: 'User not found.' };

  const issued = await issueToken(user.id, requestedByName);
  if (!issued) return { ok: false, error: 'Too many reset links were requested for this account. Try again in an hour.' };

  try {
    await emailLink(user, issued.token);
  } catch (e) {
    await discardLink(issued.token);
    console.error('[password-reset] could not send email:', e instanceof Error ? e.message : e);
    return { ok: false, error: 'Could not send the email. Check the SMTP settings on the server.' };
  }
  await retireOtherLinks(user.id, issued.token);

  await logAudit(prisma, {
    entity: 'USER',
    entityId: user.id,
    action: 'ACCESS_CHANGE',
    summary: `Password reset link emailed to “${user.name || user.email}” (requested by ${requestedByName})`,
    userName: requestedByName,
  });
  return { ok: true, email: user.email };
}

// -------------------------------------------------------- redeem the link
export type CompleteResult = { ok: true } | { ok: false; error: string };

export async function completePasswordReset(token: string, newPassword: string): Promise<CompleteResult> {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_NEW_PASSWORD) {
    return { ok: false, error: `Use at least ${MIN_NEW_PASSWORD} characters.` };
  }
  if (newPassword.length > MAX_NEW_PASSWORD) return { ok: false, error: 'That password is too long.' };

  const check = await checkResetToken(token);
  if (!check.ok) return { ok: false, error: TOKEN_PROBLEM[check.reason] };

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.passwordResetToken.findUnique({
        where: { tokenHash: sha256(token) },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      if (!row) throw new Error(TOKEN_PROBLEM.invalid);
      const now = new Date();

      // Claim the link. Only one request can flip usedAt from null, so a link
      // opened in two tabs (or replayed) can be redeemed exactly once.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw new Error(TOKEN_PROBLEM.used);

      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash: hashPassword(newPassword), passwordChangedAt: now },
      });
      // Any other link still outstanding for this account dies with this one.
      await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });

      await logAudit(tx, {
        entity: 'USER',
        entityId: row.userId,
        action: 'ACCESS_CHANGE',
        summary: `Password changed through an email link for “${row.user.name || row.user.email}”`,
        userId: row.userId,
        userName: row.user.name || row.user.email,
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not change the password.' };
  }
}
