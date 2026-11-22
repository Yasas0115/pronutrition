'use client';

import { useState } from 'react';
import { fmtDateTime } from '@/lib/dates';
import type { AuditRow } from '@/lib/audit';
import { useT } from '@/components/I18nProvider';

const ENTITY_LABEL: Record<string, string> = {
  PRODUCT: 'Product',
  USER: 'Staff',
  BRANCH: 'Branch',
  SETTINGS: 'Settings',
  STOCK: 'Stock',
  CATEGORY: 'Category',
  CUSTOMER: 'Customer',
  EXPENSE: 'Expense',
  SALARY: 'Salary',
  WORKER: 'Worker',
  FLOAT: 'Float',
  SALE: 'Sale',
};

// Who changed what, when — products, prices, staff, settings, money.
export default function ActivityView({ rows }: { rows: AuditRow[] }) {
  const t = useT();
  const [entity, setEntity] = useState('all');
  const entities = Array.from(new Set(rows.map((r) => r.entity)));
  const shown = entity === 'all' ? rows : rows.filter((r) => r.entity === entity);

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">{t("Activity log")}</h1>
        <p className="page-sub">{t(rows.length === 1 ? "Who changed what, and when — the latest {0} change" : "Who changed what, and when — the latest {0} changes", [rows.length])}{t(", company-wide.")}</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        <button className="chip" data-active={entity === 'all' || undefined} onClick={() => setEntity('all')}>{t("All")}</button>
        {entities.map((e) => (
          <button key={e} className="chip" data-active={entity === e || undefined} onClick={() => setEntity(e)}>
            {t(ENTITY_LABEL[e] ?? e)}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t("When")}</th>
                <th>{t("Area")}</th>
                <th>{t("What happened")}</th>
                <th>{t("Changes")}</th>
                <th>{t("By")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={5} className="text-center" style={{ color: 'var(--color-faint)', padding: 40 }}>{t("Nothing recorded yet.")}</td></tr>
              ) : (
                shown.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap" style={{ color: 'var(--color-muted)', fontSize: 12 }}>{fmtDateTime(a.createdAt)}</td>
                    <td><span className="chip" style={{ cursor: 'default' }}>{t(ENTITY_LABEL[a.entity] ?? a.entity)}</span></td>
                    <td className="text-strong text-[13.5px]">{t(a.summary)}</td>
                    <td className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
                      {a.changes.length === 0
                        ? '—'
                        : a.changes.map((c) => (
                            <div key={c.field}>
                              {t(c.field)}: {c.from} → <b style={{ color: 'var(--color-strong)' }}>{c.to}</b>
                            </div>
                          ))}
                    </td>
                    <td style={{ color: 'var(--color-muted)', fontSize: 12 }}>{a.userName || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
