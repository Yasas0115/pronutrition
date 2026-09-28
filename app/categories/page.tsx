import { requireModule } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getShellProps } from '@/lib/shell';
import AppShell from '@/components/AppShell';
import CategoryManager from '@/components/CategoryManager';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const session = await requireModule('categories');
  const [shell, categories, counts] = await Promise.all([
    getShellProps(session),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.product.groupBy({ by: ['category'], _count: { _all: true } }),
  ]);

  const countByName = new Map(counts.map((c) => [c.category, c._count._all]));
  const cats = categories.map((c) => ({
    id: c.id,
    name: c.name,
    count: countByName.get(c.name) ?? 0,
  }));

  return (
    <AppShell {...shell}>
      <div className="mb-5">
        <h1 className="page-title">Categories</h1>
        <p className="page-sub">Add or remove the categories products can be filed under.</p>
      </div>
      <CategoryManager categories={cats} />
    </AppShell>
  );
}
