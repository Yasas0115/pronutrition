'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/lib/money';
import Modal from './Modal';
import { stockCheckAction } from '@/app/stock/actions';
import type { StockCheckResult, StockIssue } from '@/lib/stock-check';

const KIND_LABEL: Record<StockIssue['kind'], string> = {
  MISMATCH: 'Count differs from history',
  BROKEN_CHAIN: 'History has a gap',
  NO_HISTORY: 'No history',
};

function IssueTable({ rows }: { rows: StockIssue[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr><th>Branch</th><th>Product</th><th className="text-center">On hand</th><th className="text-center">History says</th><th>What is wrong</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.branchName}</td>
              <td className="text-strong">{r.productName}</td>
              <td className="text-center num">{fmt(r.onHand)}</td>
              <td className="text-center num">{r.ledger == null ? '—' : fmt(r.ledger)}</td>
              <td className="text-[12.5px]">
                <span className="badge" style={{ color: r.kind === 'NO_HISTORY' ? 'var(--color-muted)' : 'var(--color-brand)', background: 'var(--color-ink-1)' }}>
                  {KIND_LABEL[r.kind]}
                </span>
                <div style={{ color: 'var(--color-muted)' }}>{r.detail}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Replays the stock history and compares it with the live counts, so a hand
// edit or a lost movement shows up instead of silently skewing every report.
export default function StockCheckModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<{ result: StockCheckResult } | { error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    stockCheckAction().then((res) => {
      if (!alive) return;
      setState(res.ok ? { result: res.result } : { error: res.error });
    });
    return () => { alive = false; };
  }, []);

  return (
    <Modal title="Stock check" onClose={onClose} maxWidth={760} footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      {!state ? (
        <div className="text-center py-10" style={{ color: 'var(--color-faint)' }}>Checking every stock record…</div>
      ) : 'error' in state ? (
        <div className="text-[13.5px]" style={{ color: 'var(--color-brand)' }}>{state.error}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {state.result.problems.length === 0 ? (
            <div className="rounded-lg px-4 py-3 text-[14px]" style={{ background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}>
              <b style={{ color: 'var(--color-ok)' }}>All good.</b> Checked {fmt(state.result.checked)} stock record
              {state.result.checked === 1 ? '' : 's'}: every count matches its history.
            </div>
          ) : (
            <>
              <div className="text-[14px]" style={{ color: 'var(--color-brand)' }}>
                {state.result.problems.length} problem{state.result.problems.length === 1 ? '' : 's'} found in{' '}
                {fmt(state.result.checked)} stock records.
              </div>
              <IssueTable rows={state.result.problems} />
              <p className="text-[12.5px]" style={{ color: 'var(--color-muted)' }}>
                Fix a count from the Stock tab (a stock-take) — that writes a new history line that brings the two
                back into agreement.
              </p>
            </>
          )}

          {state.result.noHistory.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[13px]" style={{ color: 'var(--color-muted)' }}>
                {state.result.noHistory.length} item{state.result.noHistory.length === 1 ? ' has' : 's have'} stock but no
                recorded history (normal for stock entered before history was kept)
              </summary>
              <div className="mt-2"><IssueTable rows={state.result.noHistory} /></div>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
