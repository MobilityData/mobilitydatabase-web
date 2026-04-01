import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import GtfsDiffTool from '../../screens/GtfsDiffTool';
import { type Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Diff Tool | MobilityDatabase',
  description:
    'Compare two GTFS feeds side by side. View semantic entity-level changes across routes, service periods, and stops, or drill into raw per-file row diffs.',
  openGraph: {
    title: 'GTFS Diff Tool | MobilityDatabase',
    description:
      'Compare two GTFS feeds side by side. View semantic entity-level changes across routes, service periods, and stops, or drill into raw per-file row diffs.',
    url: 'https://mobilitydatabase.org/gtfs-diff-tool',
    siteName: 'MobilityDatabase',
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

export default async function GtfsDiffToolPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;

  setRequestLocale(locale);

  return <GtfsDiffTool />;
}
