// Generic "who changed what, when" trail. Ledgers with their own tables (stock
// movements, price history) don't need this; it covers edits that would
// otherwise leave no trace — products, staff, branches, settings.
//
// `logAudit` takes a Prisma client OR a transaction client, so callers can write
// the audit row in the same transaction as the change it describes.
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditEntity =
  | 'PRODUCT' | 'USER' | 'BRANCH' | 'SETTINGS' | 'STOCK' | 'CATEGORY' | 'CUSTOMER'
  | 'EXPENSE' | 'SALARY' | 'WORKER' | 'FLOAT';
export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'PRICE_CHANGE' | 'ACCESS_CHANGE' | 'PAYMENT' | 'VOID';

export type AuditEntry = {
  entity: AuditEntity;
  entityId?: string | null;
  action: AuditAction;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  branchId?: string | null;
  userId?: string | null;
  userName?: string | null;
};

export async function logAudit(db: Db, e: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      entity: e.entity,
      entityId: e.entityId ?? null,
      action: e.action,
      summary: e.summary.slice(0, 2000),
      before: e.before ? JSON.stringify(e.before) : null,
      after: e.after ? JSON.stringify(e.after) : null,
      branchId: e.branchId ?? null,
      userId: e.userId ?? null,
      userName: e.userName ?? null,
    },
  });
}

// One activity-log line as the Accounting › Activity log shows it: the stored
// before/after JSON turned into "field: from → to" rows.
export type AuditRow = {
  id: string;
  entity: string;
  action: string;
  summary: string;
  userName: string | null;
  createdAt: string;
  changes: { field: string; from: string; to: string }[];
};

function parseSnapshot(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const shown = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));

export async function loadAudit(db: Db, limit = 200): Promise<AuditRow[]> {
  const rows = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  return rows.map((a) => {
    const before = parseSnapshot(a.before);
    const after = parseSnapshot(a.after);
    const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    return {
      id: a.id,
      entity: a.entity,
      action: a.action,
      summary: a.summary,
      userName: a.userName,
      createdAt: a.createdAt.toISOString(),
      changes: fields.map((f) => ({ field: f, from: shown(before[f]), to: shown(after[f]) })),
    };
  });
}

// Returns only the keys whose value differs, as { before, after } — so an audit
// row records what actually changed instead of the whole record.
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T>; changed: string[] } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const changed: string[] = [];
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (before[k] !== after[k]) {
      b[k] = before[k];
      a[k] = after[k];
      changed.push(String(k));
    }
  }
  return { before: b, after: a, changed };
}
