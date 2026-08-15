import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';

import { ServiceWorkerRegistration } from '../components/service-worker-registration';
import './globals.css';

const fredoka = Fredoka({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-fredoka',
});

const nunito = Nunito({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '600', '700', '800'],
});

export const metadata: Metadata = {
  applicationName: 'FamilyStar',
  title: 'FamilyStar',
  description: '家庭成长管理工具',
  manifest: '/manifest.webmanifest',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
