'use server';

import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { getEffectiveModules } from '@/lib/branch';

// Backs the Ctrl+K search box. Returns names only (never prices or costs) and
// only for the lists the signed-in person may already open.
export type PaletteHit = {
  kind: 'product' | 'customer';
  id: string;
  title: string;
  sub: string;
  href: string;
};

export async function searchPalette(q: string): Promise<PaletteHit[]> {
  const session = await requireSession();
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const eff = await getEffectiveModules(session);
  const out: PaletteHit[] = [];

  if (eff.has('products') || eff.has('stock')) {
    const rows = await prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: term } },
          { brand: { contains: term } },
          { sku: { contains: term } },
          { barcode: { contains: term } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 5,
      select: { id: true, name: true, category: true, brand: true },
    });
    for (const p of rows) {
      out.push({ kind: 'product', id: p.id, title: p.name, sub: [p.brand, p.category].filter(Boolean).join(' · '), href: '/products' });
    }
  }

  if (eff.has('customers')) {
    const rows = await prisma.customer.findMany({
      where: { active: true, OR: [{ name: { contains: term } }, { phone: { contains: term } }] },
      orderBy: { name: 'asc' },
      take: 5,
      select: { id: true, name: true, phone: true },
    });
    for (const c of rows) {
      out.push({ kind: 'customer', id: c.id, title: c.name, sub: c.phone ?? '', href: '/customers' });
    }
  }

  return out;
}
