// Server-side session helpers built on next/headers cookies (Next 15: async).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  TOKEN_COOKIE,
  sessionFromToken,
  signSession,
  isOwner,
  type Session,
} from './session';
import { getEffectiveModules } from './branch';
import { landingRoute, type ModuleKey } from './modules';

const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  return sessionFromToken(token);
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

// Owner-only areas (Settings, first-run setup).
export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (!isOwner(session)) redirect('/');
  return session;
}

// Gate a page behind a module: the owner always passes; a staff member passes
// only if the owner granted them that module. Otherwise they are bounced to the
// first page they can open (never a loop, since they lack the requested one).
export async function requireModule(key: ModuleKey): Promise<Session> {
  const session = await requireSession();
  const eff = await getEffectiveModules(session);
  if (!eff.has(key)) redirect(landingRoute(eff));
  return session;
}

export async function setSessionCookie(session: Session): Promise<void> {
  const token = await signSession(session);
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(TOKEN_COOKIE);
}

export { isOwner };
