import type { Prisma, PrismaClient } from '@prisma/client';
import { todayStr } from './dates';

type Db = PrismaClient | Prisma.TransactionClient;

export type LivePromotion = { id: string; name: string; percent: number };

type PromoRow = { id: string; name: string; percent: number; startsOn: string | null; endsOn: string | null; active: boolean };

// A seasonal discount is "live" when it is switched on and today (Sri Lanka
// time) is inside its optional From/To window (both ends inclusive).
export function isLive(p: PromoRow, today = todayStr()): boolean {
  if (!p.active) return false;
  if (p.startsOn && today < p.startsOn) return false;
  if (p.endsOn && today > p.endsOn) return false;
  return p.percent > 0;
}

export async function livePromotions(db: Db): Promise<LivePromotion[]> {
  const rows = await db.promotion.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  const today = todayStr();
  return rows.filter((r) => isLive(r, today)).map((r) => ({ id: r.id, name: r.name, percent: r.percent }));
}

// Combined seasonal % (they stack), never above 100.
export const promoPercent = (list: { percent: number }[]) =>
  Math.min(100, list.reduce((s, p) => s + p.percent, 0));
