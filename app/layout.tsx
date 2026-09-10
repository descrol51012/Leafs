import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '藍色樹葉留言',
  description: '掃描 QR Code，一起在同一棵樹上留下想法。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
