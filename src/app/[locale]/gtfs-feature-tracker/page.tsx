import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsFeatureTracker from './components/GtfsFeatureTracker';
import { fetchTrackerData } from './lib/fetchTrackerData';

export const dynamic = 'force-static';
export const revalidate = 86400; // Revalidate every day

export const metadata: Metadata = {
  title: 'GTFS Features Adoption Tracker | MobilityDatabase',
  description:
    'Track the adoption of GTFS features across major journey planners including Google, Transit, Motis, OpenTripPlanner, and more.',
  openGraph: {
    title: 'GTFS Features Adoption Tracker | MobilityDatabase',
    description:
      'Track the adoption of GTFS features across major journey planners including Google, Transit, Motis, OpenTripPlanner, and more.',
    url: 'https://mobilitydatabase.org/gtfs-feature-tracker',
    siteName: 'MobilityDatabase',
    type: 'website',
  },
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsFeatureTrackerPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const { features, consumers, knownFields } = await fetchTrackerData();

  return (
    <GtfsFeatureTracker
      features={features}
      consumers={consumers}
      knownFields={knownFields}
    />
  );
}
