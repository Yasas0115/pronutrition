// Date helpers. Sales are timestamped with real DateTime; these format for the
// UI and compute day boundaries for "today's takings" style reports.
//
// Everything is anchored to Sri Lanka time (Asia/Colombo, UTC+05:30, no DST).
// The server (a UTC VPS) and the browser can sit in different zones, so day
// and month boundaries must NOT use the host's local zone — otherwise "today"
// would roll over at 05:30 and reports would be off by half a day.
export const TIME_ZONE = 'Asia/Colombo';
const OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Colombo is a fixed UTC+05:30
const DAY_MS = 24 * 60 * 60 * 1000;

// Wall-clock "shifted" date: its UTC fields read as Colombo local time.
const shifted = (d: Date) => new Date(d.getTime() + OFFSET_MS);

/** YYYY-MM-DD in Sri Lanka time. */
export function todayStr(d = new Date()): string {
  const s = shifted(d);
  const y = s.getUTCFullYear();
  const m = String(s.getUTCMonth() + 1).padStart(2, '0');
  const day = String(s.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The instant of 00:00 Sri Lanka time on the day containing `d`. */
export function startOfDay(d = new Date()): Date {
  return new Date(Math.floor((d.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS);
}

/** The instant of 23:59:59.999 Sri Lanka time on the day containing `d`. */
export function endOfDay(d = new Date()): Date {
  return new Date(startOfDay(d).getTime() + DAY_MS - 1);
}

/** The instant of 00:00 on the 1st of the month (Sri Lanka time) containing `d`. */
export function startOfMonth(d = new Date()): Date {
  const s = shifted(d);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1) - OFFSET_MS);
}

/** YYYY-MM in Sri Lanka time (the key a salary month is stored under). */
export function monthKey(d = new Date()): string {
  return todayStr(d).slice(0, 7);
}

/** First and last instant of a `YYYY-MM` month in Sri Lanka time, or null if invalid. */
export function monthRange(ym: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return {
    start: new Date(Date.UTC(y, mo - 1, 1) - OFFSET_MS),
    end: new Date(Date.UTC(y, mo, 1) - OFFSET_MS - 1),
  };
}

/** Parse a `YYYY-MM-DD` date input as the start of that day in Sri Lanka time. */
export function parseDay(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? new Date(t - OFFSET_MS) : null;
}

/**
 * A report's From/To (`YYYY-MM-DD`, inclusive Sri Lanka days) from the page's
 * query string. Missing or invalid ends default to month-to-date; a reversed
 * pair is swapped. `range.to` is the last instant of the "to" day.
 */
export function resolveRange(
  from: string | undefined,
  to: string | undefined,
  now = new Date(),
): { fromDay: Date; toDay: Date; range: { from: Date; to: Date } } {
  let fromDay = parseDay(from ?? '') ?? startOfMonth(now);
  let toDay = parseDay(to ?? '') ?? startOfDay(now);
  if (fromDay.getTime() > toDay.getTime()) [fromDay, toDay] = [toDay, fromDay];
  return { fromDay, toDay, range: { from: fromDay, to: endOfDay(toDay) } };
}

export function fmtDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

/** A business date with no time of day ("12 Oct 2026"), in Sri Lanka time. */
export function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
}

export function fmtTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
}
