// Signed session token (JWT via jose) + the cookie name. Pure JS, so it runs
// in both the Node server and the Edge middleware runtime.
import { SignJWT, jwtVerify } from 'jose';

export const TOKEN_COOKIE = 'pn_session';

export type Role = 'OWNER' | 'STAFF';

export type Session = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  // The branch a STAFF member is pinned to. null = all branches (also OWNER).
  branchId: string | null;
};

// Normalize any stored role value to the two we support. Legacy "CASHIER" rows
// (from before custom staff) are treated as STAFF.
export const normalizeRole = (raw: unknown): Role => (raw === 'OWNER' ? 'OWNER' : 'STAFF');

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'pro-nutrition-dev-secret',
);

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ email: s.email, name: s.name, role: s.role, branchId: s.branchId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret);
}

export async function sessionFromToken(
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: String(payload.sub),
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      role: normalizeRole(payload.role),
      branchId: payload.branchId ? String(payload.branchId) : null,
    };
  } catch {
    return null;
  }
}

export const isOwner = (s: Session | null) => s?.role === 'OWNER';
