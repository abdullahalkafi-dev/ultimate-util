import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProviders } from '@/components/providers/AppProviders';
import '@/styles/globals.css';

// Fonts are downloaded at build time and served from our own origin.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Ultimate Util: everyday tools that run in your browser', template: '%s · Ultimate Util' },
  description:
    'Document, image, design and developer tools that run in your browser. Your files are not uploaded.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0f19',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
