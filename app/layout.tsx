import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed, Noto_Sans_Sinhala, Noto_Sans_Tamil } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/toast';
import I18nProvider from '@/components/I18nProvider';
import { getLocale, loadDict } from '@/lib/i18n/server';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-barlow-cond',
  display: 'swap',
});

// Sinhala / Tamil glyphs. Barlow has none, so these sit behind it in the font
// stack (see --font-sans in globals.css). preload:false keeps English users
// from downloading them; the browser fetches a font only when a glyph needs it.
const notoSinhala = Noto_Sans_Sinhala({
  subsets: ['sinhala'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sinhala',
  display: 'swap',
  preload: false,
});

const notoTamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-tamil',
  display: 'swap',
  preload: false,
});

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
      className={`${barlow.variable} ${barlowCondensed.variable} ${notoSinhala.variable} ${notoTamil.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <I18nProvider locale={locale} dict={dict}>
          {children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
