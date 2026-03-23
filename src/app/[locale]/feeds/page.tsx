import { type ReactElement, Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import FeedsScreen from './components/FeedsScreen';
import FeedsScreenSkeleton from '../../screens/Feeds/FeedsScreenSkeleton';
import { type Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Transit Feeds | Mobility Database',
  description:
    'Browse thousands of GTFS, GTFS-RT, and GBFS transit feeds from agencies around the world. Search and filter open public transit data by location, type, or provider.',
  alternates: {
    canonical: '/feeds',
  },
  openGraph: {
    title: 'Transit Feeds | Mobility Database',
    description:
      'Browse thousands of GTFS, GTFS-RT, and GBFS transit feeds from agencies around the world. Search and filter open public transit data by location, type, or provider.',
    url: 'https://mobilitydatabase.org/feeds',
    siteName: 'Mobility Database',
    type: 'website',
  },
};

export function generateStaticParams(): Array<{
  locale: Locale;
}> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function FeedsPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return (
    <Suspense fallback={<FeedsScreenSkeleton />}>
      <FeedsScreen />
    </Suspense>
  );
}
