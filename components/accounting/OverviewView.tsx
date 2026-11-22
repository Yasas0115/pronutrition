'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { money, fmt } from '@/lib/money';
import { useT } from '@/components/I18nProvider';

type Day = { key: string; total: number };

// Round the chart's top up to a tidy number (1, 2, 2.5, 5 × a power of ten) so
// the axis labels read cleanly; an empty week still gets a small scale.
function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((s) => s * p >= v) ?? 10) * p;
}

// 228500 -> "229k", 1200000 -> "1.2M": short axis labels.
function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}

// Smooth line through the points (monotone cubic), so a curve never dips below
// a zero day or overshoots a peak.
function smooth(p: [number, number][]): string {
  const n = p.length;
  if (n < 2) return '';
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0];
    m[i] = (p[i + 1][1] - p[i][1]) / dx[i];
  }
  const tg: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  tg[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
    const a = tg[i] / m[i], b = tg[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); tg[i] = k * a * m[i]; tg[i + 1] = k * b * m[i]; }
  }
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    d += ` C${(p[i][0] + dx[i] / 3).toFixed(1)},${(p[i][1] + (tg[i] * dx[i]) / 3).toFixed(1)}`
      + ` ${(p[i + 1][0] - dx[i] / 3).toFixed(1)},${(p[i + 1][1] - (tg[i + 1] * dx[i]) / 3).toFixed(1)}`
      + ` ${p[i + 1][0].toFixed(1)},${p[i + 1][1].toFixed(1)}`;
  }
  return d;
}

// Accounting › Overview: today at a glance. Read-only; every card links to the
// page that holds the detail.
export default function OverviewView({
  currency,
  scopeLabel,
  dateLabel,
  today,
  yesterdayTakings,
  month,
  days,
  lowStock,
  lowStockTotal,
  owed,
  monthProfit,
  links,
}: {
  currency: string;
  scopeLabel: string;
  dateLabel: string;
  today: { takings: number; count: number };
  yesterdayTakings: number;
  month: { takings: number; count: number };
  days: Day[]; // 14 days, oldest first
  lowStock: { name: string; branch: string | null; stock: number }[];
  lowStockTotal: number;
  owed: { total: number; customers: number; top: { name: string; due: number }[] } | null;
  monthProfit: number | null;
  links: { products: boolean; receivables: boolean; profit: boolean };
}) {
  const t = useT();

  // Today vs yesterday. No percentage when yesterday had no sales.
  const delta =
    yesterdayTakings > 0 ? Math.round(((today.takings - yesterdayTakings) / yesterdayTakings) * 100) : null;
  const up = (delta ?? 0) >= 0;

  const prevWeek = days.slice(0, 7);
  const thisWeek = days.slice(7);
  const weekTotal = thisWeek.reduce((s, d) => s + d.total, 0);
  const prevTotal = prevWeek.reduce((s, d) => s + d.total, 0);
  // The chart is drawn at its real pixel width (re-measured on resize) so the
  // text stays 11px instead of scaling up with the card.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(Math.max(260, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 190, L = 48, R = 24, T = 12, B = 28;
  const max = niceMax(Math.max(...days.map((d) => d.total)));
  const x = (i: number) => L + (i / 6) * (w - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const base = H - B;
  const pts = (arr: Day[]): [number, number][] => arr.map((d, i) => [x(i), y(d.total)]);
  const prevPath = smooth(pts(prevWeek));
  const thisPath = smooth(pts(thisWeek));
  const area = `${thisPath} L${x(6).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
  const ticks = [0, max / 2, max];
  const weekday = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

  const Card = ({ href, children }: { href?: string | false; children: React.ReactNode }) =>
    href ? (
      <Link href={href} className="stat block" style={{ textDecoration: 'none' }}>{children}</Link>
    ) : (
      <div className="stat">{children}</div>
    );

  return (
    <>
      <div className="mb-5">
        <h1 className="page-title">{t("Overview")}</h1>
        <p className="page-sub">
          {t("Today at a glance for")}{' '}<b style={{ color: 'var(--color-strong)' }}>{t(scopeLabel)}</b> · {dateLabel}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card href="/accounting/sales">
          <div className="stat__label">{t("Takings today")}</div>
          <div className="stat__value accent">{money(today.takings, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: delta === null ? 'var(--color-muted)' : up ? 'var(--color-ok)' : 'var(--color-brand)' }}>
            {delta === null ? t("{0} sales today", [today.count]) : `${up ? '▲' : '▼'} ${Math.abs(delta)}% ${t("vs yesterday")}`}
          </div>
        </Card>
        <Card href="/accounting/sales">
          <div className="stat__label">{t("Takings this month")}</div>
          <div className="stat__value">{money(month.takings, currency)}</div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{t("{0} sales", [month.count])}</div>
        </Card>
        {owed && (
          <Card href={links.receivables && '/accounting/receivables'}>
            <div className="stat__label">{t("Still to collect")}</div>
            <div className="stat__value" style={owed.total > 0 ? { color: 'var(--color-warn)' } : undefined}>{money(owed.total, currency)}</div>
            <div className="text-[12px] mt-1" style={{ color: 'var(--color-muted)' }}>{t("{0} customers owe", [owed.customers])}</div>
          </Card>
        )}
        {monthProfit !== null && (
          <Card href={links.profit && '/accounting/profit'}>
            <div className="stat__label">{t("Net profit this month")}</div>
            <div className="stat__value" style={{ color: monthProfit < 0 ? 'var(--color-brand)' : undefined }}>
              {monthProfit < 0 ? '− ' : ''}{money(Math.abs(monthProfit), currency)}
            </div>
          </Card>
        )}
      </div>

      <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="brand" style={{ fontSize: 17 }}>{t("Takings, last 7 days")}</div>
            <div className="flex items-center gap-4 text-[12px]" style={{ color: 'var(--color-muted)' }}>
              <span className="inline-flex items-center gap-1.5"><span style={{ width: 14, height: 3, background: 'var(--color-brand)', display: 'inline-block' }} />{t("This week")} {money(weekTotal, currency)}</span>
              <span className="inline-flex items-center gap-1.5"><span style={{ width: 14, height: 0, borderTop: '2px dashed var(--color-faint)', display: 'inline-block' }} />{t("Week before")} {money(prevTotal, currency)}</span>
            </div>
          </div>
          <div ref={wrapRef} style={{ width: '100%' }}>
            <svg width={w} height={H} style={{ display: 'block' }} role="img" aria-label={t("Daily takings for the last 7 days compared with the week before")}>
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
                  <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-faint)">{compact(v)}</text>
                </g>
              ))}
              <path d={prevPath} fill="none" stroke="var(--color-faint)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
              <path d={area} fill="var(--color-brand)" opacity={0.1} />
              <path d={thisPath} fill="none" stroke="var(--color-brand)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {thisWeek.map((d, i) => (
                <g key={d.key}>
                  <circle cx={x(i)} cy={y(d.total)} r={4} fill="var(--color-brand)" stroke="var(--color-ink-2)" strokeWidth={2}>
                    <title>{`${d.key}: ${money(d.total, currency)}`}</title>
                  </circle>
                  <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-faint)">{weekday(d.key)}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="brand" style={{ fontSize: 17 }}>{t("Low stock")}</div>
              {links.products && <Link href="/products" className="text-[12px]" style={{ color: 'var(--color-brand)' }}>{t("View all")}</Link>}
            </div>
            {lowStock.length === 0 ? (
              <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>{t("Nothing is running low.")}</p>
            ) : (
              <>
                {lowStock.map((r, i) => (
                  <div key={i} className="flex justify-between gap-3 py-1.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--color-line)' }}>
                    <span className="min-w-0 truncate" style={{ color: 'var(--color-strong)' }}>
                      {r.name}{r.branch ? <span style={{ color: 'var(--color-faint)' }}> · {r.branch}</span> : null}
                    </span>
                    <span className="num shrink-0" style={{ color: r.stock <= 0 ? 'var(--color-brand)' : 'var(--color-warn)' }}>
                      {r.stock <= 0 ? t("Out") : t("{0} left", [r.stock])}
                    </span>
                  </div>
                ))}
                {lowStockTotal > lowStock.length && (
                  <p className="text-[12px] mt-2" style={{ color: 'var(--color-muted)' }}>{t("+ {0} more", [lowStockTotal - lowStock.length])}</p>
                )}
              </>
            )}
          </div>

          {owed && owed.top.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="brand" style={{ fontSize: 17 }}>{t("Biggest balances")}</div>
                {links.receivables && <Link href="/accounting/receivables" className="text-[12px]" style={{ color: 'var(--color-brand)' }}>{t("View all")}</Link>}
              </div>
              {owed.top.map((r, i) => (
                <div key={i} className="flex justify-between gap-3 py-1.5 text-[13.5px]" style={{ borderBottom: '1px solid var(--color-line)' }}>
                  <span className="min-w-0 truncate" style={{ color: 'var(--color-strong)' }}>{r.name}</span>
                  <span className="num shrink-0" style={{ color: 'var(--color-warn)' }}>{fmt(r.due)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
