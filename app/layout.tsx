import type { Metadata } from 'next';
// Fonts are self-hosted (@fontsource) so the build never depends on Google Fonts.
// Sinhala / Tamil faces sit behind Inter / Oswald in the font stack (see --font-sans
// and --font-head in globals.css); unicode-range makes the browser fetch a file only
// when a glyph needs it.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import '@fontsource/noto-sans-sinhala/400.css';
import '@fontsource/noto-sans-sinhala/500.css';
import '@fontsource/noto-sans-sinhala/600.css';
import '@fontsource/noto-sans-sinhala/700.css';
import '@fontsource/noto-sans-tamil/400.css';
import '@fontsource/noto-sans-tamil/500.css';
import '@fontsource/noto-sans-tamil/600.css';
import '@fontsource/noto-sans-tamil/700.css';
import './globals.css';
import { Toaster } from '@/components/toast';
import NavProgress from '@/components/NavProgress';
import I18nProvider from '@/components/I18nProvider';
import { getLocale, loadDict } from '@/lib/i18n/server';

export const metadata: Metadata = {
  title: 'Pro Nutrition — POS',
  description: 'Point of sale for the Pro Nutrition supplement store.',
};

// Runs before first paint to set the theme attribute, preventing a flash of the
// wrong theme. Falls back to the OS preference, then dark.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = await loadDict(locale);
  return (
    <html
      lang={locale}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <I18nProvider locale={locale} dict={dict}>
          <NavProgress />
          {children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
