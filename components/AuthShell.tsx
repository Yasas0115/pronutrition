'use client';

import type { ReactNode } from 'react';
import Splash from './Splash';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import { useT } from '@/components/I18nProvider';

/**
 * Wrapper for the login page: shows the boot splash on first paint, then the
 * centered auth card on the themed canvas. A theme toggle sits top-right so the
 * cashier can flip light/dark before signing in.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="auth-page">
      <Splash label={t("Point of Sale")} />
      <div className="fixed top-4 right-4 z-10 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
