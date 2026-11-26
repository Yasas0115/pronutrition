import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// For uptime monitors: 200 when the app and its database both answer, else 503.
// Public on purpose, so it returns nothing beyond ok / not ok.
export async function GET() {
  let ok = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    ok = false;
    console.error('Health check: database unreachable', err);
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
