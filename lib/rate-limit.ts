// A tiny in-memory sliding-window limiter, enough to stop someone hammering the
// "forgot password" form. It lives in this process only (the app runs as a
// single pm2 process), so it resets on restart — the per-account limit in the
// database (lib/password-reset.ts) is the part that must hold.
const hits = new Map<string, number[]>();

/** Returns true if the call is allowed, false if `key` has used up `limit` in `windowMs`. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // Don't let the map grow without bound.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}
