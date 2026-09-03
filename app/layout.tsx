import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Chief — Executive operating system',
  description: 'A governed executive chief of staff for decisions, commitments, meetings, and prepared action.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chief.example'),
  openGraph: {
    title: 'Chief — Judgment, prepared.',
    description: 'A governed executive chief of staff for decisions, commitments, meetings, and prepared action.',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'Chief — Judgment, prepared.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chief — Judgment, prepared.',
    description: 'A governed executive chief of staff for decisions, commitments, meetings, and prepared action.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
