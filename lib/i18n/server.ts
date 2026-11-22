import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, makeT, type Dict, type Locale, type TFn } from './translate';

/** The visitor's language, from the `lang` cookie (English when unset). */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** The dictionary for a locale (null for English: keys are the English text). */
export async function loadDict(locale: Locale): Promise<Dict | null> {
  if (locale === 'si') return (await import('./dict/si')).default;
  if (locale === 'ta') return (await import('./dict/ta')).default;
  return null;
}

/** `const t = await getT();` — translate on the server (pages, actions). */
export async function getT(): Promise<TFn> {
  return makeT(await loadDict(await getLocale()));
}
