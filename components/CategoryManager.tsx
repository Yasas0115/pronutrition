'use client';

import { useRouter } from 'next/navigation';
import { addCategory, deleteCategory, renameCategory } from '@/app/categories/actions';
import NameListManager from './NameListManager';

export type CategoryRow = { id: string; name: string; count: number };

// Product categories: add, click-to-rename, delete (products move to
// Uncategorized). The list UI itself is the shared NameListManager.
export default function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="side-label" style={{ padding: 0 }}>All categories</span>
        <span className="text-[13px]" style={{ color: 'var(--color-faint)' }}>{categories.length} total</span>
      </div>
      <NameListManager
        items={categories.map((c) => ({
          id: c.id,
          name: c.name,
          detail: `${c.count} product${c.count === 1 ? '' : 's'}`,
          confirmLabel: c.count ? `Delete · move ${c.count}` : 'Confirm',
        }))}
        placeholder="New category name…"
        emptyText="No categories yet."
        onAdd={async (n) => {
          const res = await addCategory(n);
          return res.ok ? { ok: true, message: 'Category added' } : res;
        }}
        onRemove={async (id) => {
          const res = await deleteCategory(id);
          if (!res.ok) return res;
          return {
            ok: true,
            message:
              res.moved > 0
                ? `Category deleted · ${res.moved} product${res.moved === 1 ? '' : 's'} moved to Uncategorized`
                : 'Category deleted',
          };
        }}
        onRename={renameCategory}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
