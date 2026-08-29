import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: 'Branchline — Visual generation workflows',
  description:
    'A node-based workspace for composing, running, and sharing multimodal generation workflows. Independent concept — not affiliated with Black Forest Labs.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Branchline',
    description: 'Visual generation workflows',
    images: [
      {
        url: '/og.png',
        width: 1536,
        height: 1024,
        alt: 'Branchline visual generation workflow graph',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Branchline',
    description: 'Visual generation workflows',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* Applies the stored theme before first paint to avoid a light flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('branchline-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
