// Exercises the product photo gallery: the Product.images JSON round-trips,
// the cover (imageUrl) stays the first photo, parseImages/galleryOf tolerate
// junk, and legacy single-image rows still resolve. Self-cleaning.
// Run: pnpm exec tsx scripts/verify-gallery.ts
import { PrismaClient } from '@prisma/client';
import { parseImages, galleryOf } from '../lib/images';

const prisma = new PrismaClient();
let failures = 0;

function check(label: string, cond: boolean) {
  console.log(`${cond ? '✔' : '✗ FAIL —'} ${label}`);
  if (!cond) failures++;
}

// Mirror the actions.ts save logic: normalise a gallery to {images, imageUrl}.
function normalise(photos: string[]) {
  const clean = photos.filter((s) => typeof s === 'string' && s.length > 0);
  return { images: JSON.stringify(clean), imageUrl: clean[0] ?? null };
}

async function main() {
  // ---- pure helpers ----
  check('parseImages(null) -> []', parseImages(null).length === 0);
  check('parseImages("[]") -> []', parseImages('[]').length === 0);
  check('parseImages(bad JSON) -> []', parseImages('not json').length === 0);
  check('parseImages drops non-strings', parseImages('["a", 1, null, "b"]').join(',') === 'a,b');
  check(
    'galleryOf falls back to legacy imageUrl',
    galleryOf({ images: '[]', imageUrl: 'data:legacy' }).join(',') === 'data:legacy',
  );
  check(
    'galleryOf prefers the gallery over imageUrl',
    galleryOf({ images: '["a","b"]', imageUrl: 'a' }).length === 2,
  );

  // ---- DB round-trip ----
  const a = 'data:image/jpeg;base64,AAAA';
  const b = 'data:image/jpeg;base64,BBBB';
  const c = 'data:image/jpeg;base64,CCCC';

  const norm = normalise([a, b, c]);
  const p = await prisma.product.create({
    data: { name: `ZZ Gallery ${Date.now()}`, category: 'Supplements', price: 100, ...norm },
  });
  const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
  const gallery = galleryOf(row);
  check('stored 3 photos', gallery.length === 3);
  check('cover (imageUrl) is the first photo', row.imageUrl === a);
  check('order preserved', gallery.join(',') === [a, b, c].join(','));

  // ---- make a different photo the cover (reorder), then re-save ----
  const reordered = normalise([c, a, b]);
  const p2 = await prisma.product.update({ where: { id: p.id }, data: reordered });
  check('cover updates when a photo is promoted', p2.imageUrl === c);
  check('gallery re-serialises in new order', galleryOf(p2).join(',') === [c, a, b].join(','));

  // ---- clear the gallery ----
  const p3 = await prisma.product.update({ where: { id: p.id }, data: normalise([]) });
  check('clearing gallery empties it', galleryOf(p3).length === 0);
  check('clearing gallery nulls the cover', p3.imageUrl === null);

  // cleanup
  await prisma.product.delete({ where: { id: p.id } });

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
