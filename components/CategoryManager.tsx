'use client';

import { useRouter } from 'next/navigation';
import { addCategory, deleteCategory, renameCategory } from '@/app/(app)/categories/actions';
import NameListManager from './NameListManager';
import { useT } from '@/components/I18nProvider';

export type CategoryRow = { id: string; name: string; count: number };

// Product categories: add, click-to-rename, delete (products move to
// Uncategorized). The list UI itself is the shared NameListManager.
export default function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const t = useT();
  const router = useRouter();

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="side-label" style={{ padding: 0 }}>{t("All categories")}</span>
        <span className="text-[13px]" style={{ color: 'var(--color-faint)' }}>{t("{0} total", [categories.length])}</span>
      </div>
      <NameListManager
        items={categories.map((c) => ({
          id: c.id,
          name: c.name,
          detail: t(c.count === 1 ? "{0} product" : "{0} products", [c.count]),
          confirmLabel: c.count ? t("Delete · move {0}", [c.count]) : t("Confirm"),
        }))}
        placeholder={t("New category name…")}
        emptyText={t("No categories yet.")}
        onAdd={async (n) => {
          const res = await addCategory(n);
          return res.ok ? { ok: true, message: t('Category added') } : res;
        }}
        onRemove={async (id) => {
          const res = await deleteCategory(id);
          if (!res.ok) return res;
          return {
            ok: true,
            message:
              res.moved > 0
                ? t(res.moved === 1 ? "Category deleted · {0} product moved to Uncategorized" : "Category deleted · {0} products moved to Uncategorized", [res.moved])
                : t('Category deleted'),
          };
        }}
        onRename={renameCategory}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
