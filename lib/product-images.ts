// Server-only helpers for product photos.
//
// Photos live in the database as base64 data: URLs (Product.imageUrl / images).
// Putting those strings in a page's data made every page load ship megabytes to
// the browser. Instead pages receive a tiny URL (/api/product-image/<id>?v=...)
// and the browser downloads each photo once and caches it.
import { prisma } from './db';
import { galleryOf } from './images';

export type ImageMeta = {
  /** Number of photos in the gallery (a lone legacy cover counts as 1). */
  count: number;
  /** Cache-buster: changes whenever the product is edited. */
  v: number;
};

/** Photo count + version for every product, without loading the photo data. */
export async function loadImageMeta(): Promise<Map<string, ImageMeta>> {
  try {
    return await loadImageMetaFast();
  } catch (err) {
    // Safety net: if the database dislikes the fast query, fall back to reading
    // the photos and counting them in code (slower, but always correct).
    console.error('loadImageMeta fast path failed, using fallback', err);
    const rows = await prisma.product.findMany({
      select: { id: true, images: true, imageUrl: true, updatedAt: true },
    });
    return new Map(
      rows.map((r) => [r.id, { count: galleryOf(r).length, v: r.updatedAt.getTime() }] as const),
    );
  }
}

async function loadImageMetaFast(): Promise<Map<string, ImageMeta>> {
  const rows = await prisma.$queryRaw<
    { id: string; cnt: bigint | number | null; hasCover: bigint | number | null; v: Date }[]
  >`SELECT id,
      CASE WHEN images IS NOT NULL AND JSON_VALID(images) THEN JSON_LENGTH(images) ELSE 0 END AS cnt,
      (imageUrl IS NOT NULL AND imageUrl <> '') AS hasCover,
      updatedAt AS v
    FROM Product`;
  const out = new Map<string, ImageMeta>();
  for (const r of rows) {
    const cnt = Number(r.cnt ?? 0);
    const count = cnt > 0 ? cnt : Number(r.hasCover ?? 0) > 0 ? 1 : 0;
    out.set(r.id, { count, v: new Date(r.v).getTime() });
  }
  return out;
}

/** URL of a product's cover photo, or null when it has none. */
export function coverUrl(id: string, meta: ImageMeta | undefined): string | null {
  return meta && meta.count > 0 ? `/api/product-image/${id}?v=${meta.v}` : null;
}
