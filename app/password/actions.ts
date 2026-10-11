'use server';

import { headers } from 'next/headers';
import { requireSession, requireModule } from '@/lib/auth';
import {
  requestPasswordReset,
  sendResetLinkToUser,
  completePasswordReset,
  MIN_NEW_PASSWORD,
} from '@/lib/password-reset';
import { allow } from '@/lib/rate-limit';

export type FormState = { ok: true } | { ok: false; error: string } | null;
export type SendState = { ok: true; email: string } | { ok: false; error: string };

// The visitor's address as reported by the reverse proxy (nginx sets
// X-Forwarded-For). null when no proxy header is present.
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const raw = h.get('x-forwarded-for') ?? h.get('x-real-ip');
  const first = raw?.split(',')[0]?.trim();
  return first || null;
}

// ---------- public: "Forgot password?" ----------
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Enter your email.' };

  // Two limits so neither one address nor one visitor can hammer the form. They
  // apply to unknown emails exactly as to known ones, so the answer still never
  // reveals who has an account.
  const ip = await clientIp();
  // The per-address limit always applies. The per-visitor one only when the proxy
  // told us who the visitor is — otherwise everyone would share one "unknown"
  // bucket and a handful of requests would lock real users out.
  if ((ip && !allow(`forgot:ip:${ip}`, 10, 15 * 60_000)) || !allow(`forgot:email:${email}`, 5, 60 * 60_000)) {
    return { ok: false, error: 'Too many requests. Please wait a few minutes and try again.' };
  }

  const res = await requestPasswordReset(email);
  return res.ok ? { ok: true } : res;
}

// ---------- public: the page the emailed link opens ----------
export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password !== confirm) return { ok: false, error: 'The two passwords do not match.' };
  if (password.length < MIN_NEW_PASSWORD) {
    return { ok: false, error: `Use at least ${MIN_NEW_PASSWORD} characters.` };
  }

  const ip = await clientIp();
  if (ip && !allow(`reset:ip:${ip}`, 20, 15 * 60_000)) {
    return { ok: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const res = await completePasswordReset(token, password);
  return res.ok ? { ok: true } : res;
}

// ---------- signed in: "Change password" in the account menu ----------
// There is no "type a new password" box anywhere: even your own password changes
// through a link sent to your email, which proves the mailbox is yours.
export async function requestOwnPasswordChange(): Promise<SendState> {
  const session = await requireSession();
  if (!allow(`change:${session.userId}`, 3, 60 * 60_000)) {
    return { ok: false, error: 'You already asked for a link a moment ago. Check your email.' };
  }
  return sendResetLinkToUser(session.userId, session.name);
}

// ---------- staff page: "Send password reset email" ----------
export async function sendUserResetEmail(userId: string): Promise<SendState> {
  const session = await requireModule('users');
  return sendResetLinkToUser(userId, session.name);
}
