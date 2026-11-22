'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { makeT, type Dict, type Locale, type TFn } from '@/lib/i18n/translate';

type Ctx = { locale: Locale; t: TFn };

const I18nContext = createContext<Ctx>({ locale: 'en', t: makeT(null) });

/** Mounted once in the root layout with the active locale's dictionary. */
export default function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, t: makeT(dict) }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const t = useT();` — translate in a client component. */
export function useT(): TFn {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
