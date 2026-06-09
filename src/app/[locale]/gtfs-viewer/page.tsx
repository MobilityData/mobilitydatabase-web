import { type ReactElement } from 'react';
import { type Metadata } from 'next';
import dynamic from 'next/dynamic';
import { routing } from '../../../i18n/routing';
import { type Locale } from '../../../i18n/routing';

export const metadata: Metadata = {
  title: 'GTFS Viewer POC | MobilityDatabase',
  description: 'Explore GTFS dataset tables with efficient pagination and search via DuckDB-WASM.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

// ssr:false keeps DuckDB-WASM out of the server bundle, preventing the
// Turbopack WASM chunking crash at build time.
const GtfsViewerClient = dynamic(
  () => import('../../../components/gtfs-viewer/GtfsViewerClient'),
  { ssr: false },
);

export default function GtfsViewerPage(): ReactElement {
  return <GtfsViewerClient />;
}
