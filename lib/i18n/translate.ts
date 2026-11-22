// Tiny dependency-free i18n core. Pure (no next/headers, no React) so both the
// server helper and the client provider share it.
//
// The *English text itself* is the key: `t('Save')`. A locale file maps that
// exact English string to its translation; anything missing falls back to the
// English text, so a half-translated screen never shows blanks or raw ids.
//
// Dynamic text uses positional or named placeholders:
//   t('Sold {0} items', [n])         dict: 'Sold {0} items' → '{0} ක් විකිණුණා'
//   t('Hi {name}', { name })
//
// Messages that come back from the server already interpolated (an action's
// `error: 'Not enough stock for Whey'`) are matched against the placeholder
// keys of the dictionary, so 'Not enough stock for {0}' translates those too.

export const LOCALES = ['en', 'si', 'ta'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'lang';

/** Name of each language written in that language, for the picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  si: 'සිංහල',
  ta: 'தமிழ்',
};

/** Short tag shown on the picker button. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: 'EN',
  si: 'සිං',
  ta: 'த',
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export type Dict = Record<string, string>;
export type Params = ReadonlyArray<unknown> | Record<string, unknown>;
export type TFn = (key: string | null | undefined, params?: Params) => string;

function fill(s: string, params?: Params): string {
  if (!params) return s;
  const p = params as Record<string, unknown>;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));
}

type Pattern = { re: RegExp; names: string[]; out: string };
const patternCache = new WeakMap<Dict, Pattern[]>();

function patternsOf(dict: Dict): Pattern[] {
  let list = patternCache.get(dict);
  if (list) return list;
  list = [];
  for (const [key, out] of Object.entries(dict)) {
    if (!/\{\w+\}/.test(key)) continue;
    // Too little fixed text would match unrelated strings (a product called "Grand total").
    if (key.replace(/\{\w+\}/g, '').trim().length < 8) continue;
    const names: string[] = [];
    let src = '';
    let last = 0;
    for (const m of key.matchAll(/\{(\w+)\}/g)) {
      src += key.slice(last, m.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      src += '(.*?)';
      names.push(m[1]);
      last = (m.index ?? 0) + m[0].length;
    }
    src += key.slice(last).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    list.push({ re: new RegExp(`^${src}$`), names, out });
  }
  patternCache.set(dict, list);
  return list;
}

export function makeT(dict: Dict | null): TFn {
  if (!dict) {
    return (key, params) => (key == null ? '' : fill(key, params));
  }
  return (key, params) => {
    if (key == null || key === '') return '';
    const hit = dict[key];
    if (hit !== undefined) return fill(hit, params);
    // Already-interpolated text from the server: try the placeholder keys.
    if (!params) {
      for (const p of patternsOf(dict)) {
        const m = p.re.exec(key);
        if (m) {
          const vars: Record<string, string> = {};
          p.names.forEach((n, i) => (vars[n] = m[i + 1]));
          return fill(p.out, vars);
        }
      }
    }
    return fill(key, params);
  };
}
