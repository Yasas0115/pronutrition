'use client';

import { todayStr, startOfMonth, monthKey, monthRange } from '@/lib/dates';

// From / To dates plus the usual presets, for the pages that report over a
// period. It only reports changes; the page decides how to apply them.
export default function RangeBar({
  fromStr,
  toStr,
  onChange,
}: {
  fromStr: string;
  toStr: string;
  onChange: (next: { from?: string; to?: string }) => void;
}) {
  const today = todayStr();
  const monthStart = todayStr(startOfMonth());
  const prev = (() => {
    const [y, m] = monthKey().split('-').map(Number);
    const key = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const r = monthRange(key)!;
    return { from: todayStr(r.start), to: todayStr(r.end) };
  })();

  const presets = [
    { label: 'Today', from: today, to: today },
    { label: 'This month', from: monthStart, to: today },
    { label: 'Last month', from: prev.from, to: prev.to },
    { label: 'All time', from: '2000-01-01', to: today },
  ];

  return (
    <div className="card p-3 mb-5 flex flex-wrap items-end gap-3 no-print">
      <div>
        <label className="field-label">From</label>
        <input className="input" type="date" value={fromStr} max={toStr} onChange={(e) => e.target.value && onChange({ from: e.target.value })} />
      </div>
      <div>
        <label className="field-label">To</label>
        <input className="input" type="date" value={toStr} min={fromStr} max={today} onChange={(e) => e.target.value && onChange({ to: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            className="chip"
            data-active={(p.from === fromStr && p.to === toStr) || undefined}
            onClick={() => onChange({ from: p.from, to: p.to })}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
