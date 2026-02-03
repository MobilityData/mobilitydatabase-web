'use client';

// This page is temporary to ease the migration to Next.js App Router
// It will be deprecated once the migration is fully complete
import { type ReactNode, use } from 'react';
import dynamic from 'next/dynamic';

const App = dynamic(async () => await import('../../App'), { ssr: false });

interface PageProps {
  params: Promise<{
    locale: string;
    slug: string[];
  }>;
}

export default function Page({ params }: PageProps): ReactNode {
  const { locale } = use(params);
  
  // Pass locale to App so BrowserRouter can use correct basename
  return <App locale={locale} />;
}
