import { type ReactElement } from 'react';
import { type Metadata } from 'next';
import { routing } from '../../../i18n/routing';
import { type Locale } from '../../../i18n/routing';
import GtfsViewerClient from './components/GtfsViewerClient';

export const metadata: Metadata = {
  title: 'GTFS Viewer POC | MobilityDatabase',
  description: 'Explore GTFS dataset tables with efficient pagination and search via DuckDB-WASM.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

export default function GtfsViewerPage(): ReactElement {
  return <GtfsViewerClient />;
}
