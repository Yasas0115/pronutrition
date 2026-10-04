// Imports categories + products from a text file where an ALL-CAPS line starts a
// category and every other non-empty line is a product in that category.
// Products get price 0 / cost 0 (set real prices in the app afterwards).
// Existing products (same name + category) are skipped, so it is safe to re-run.
// Run: pnpm exec tsx scripts/import-catalog.ts data/catalog.txt --dry   (counts only)
//      pnpm exec tsx scripts/import-catalog.ts data/catalog.txt         (really import)
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const isHeading = (l: string) => /[A-Z]/.test(l) && l === l.toUpperCase();

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Usage: import-catalog.ts <file> [--dry]');
  const dry = args.includes('--dry');

  const cats: { name: string; products: string[] }[] = [];
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) continue;
    if (isHeading(line)) cats.push({ name: line, products: [] });
    else if (!cats.length) throw new Error(`Product before any category: "${line}"`);
    else cats[cats.length - 1].products.push(line);
  }

  let newCats = 0, newProducts = 0, skipped = 0;
  for (const [i, c] of cats.entries()) {
    const existing = await prisma.category.findUnique({ where: { name: c.name } });
    if (!existing) {
      newCats++;
      if (!dry) await prisma.category.create({ data: { name: c.name, sortOrder: i } });
    }
    for (const name of c.products) {
      const dup = await prisma.product.findFirst({ where: { name, category: c.name } });
      if (dup) { skipped++; continue; }
      newProducts++;
      if (!dry) await prisma.product.create({ data: { name, category: c.name, price: 0, cost: 0 } });
    }
    console.log(`${c.name}: ${c.products.length} products`);
  }
  console.log(`\n${dry ? 'DRY RUN — nothing written. ' : ''}New categories: ${newCats}, new products: ${newProducts}, skipped existing: ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
