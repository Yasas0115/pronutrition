import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { galleryOf } from '@/lib/images';

export const dynamic = 'force-dynamic';

// Serves one product photo as a real image so the browser can cache it.
// The page URLs carry ?v=<updatedAt>, so a cached copy is replaced as soon as
// the product is edited. Only signed-in users can fetch photos.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const idx = Math.max(0, Number(new URL(req.url).searchParams.get('i') ?? 0) || 0);

  const p = await prisma.product.findUnique({
    where: { id },
    select: { images: true, imageUrl: true },
  });
  const photo = p ? galleryOf(p)[idx] : undefined;
  if (!photo) return new Response('Not found', { status: 404 });

  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(photo);
  if (!m) return new Response('Bad image', { status: 422 });
  const [, type, b64, payload] = m;
  const bytes = b64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': type,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
