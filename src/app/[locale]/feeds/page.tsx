import { type ReactElement, Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import FeedsScreen from './components/FeedsScreen';
import FeedsScreenSkeleton from '../../screens/Feeds/FeedsScreenSkeleton';

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
