import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsDiffCdpgReport1View from '../../../screens/GtfsDiffTool/GtfsDiffCdpgReport1View';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Change Tracker – BMTC Bengaluru | MobilityDatabase',
  description:
    'Diff report for BMTC (Bengaluru Metropolitan Transport Corporation), comparing the 2026-03-03 and 2026-03-10 feed snapshots, including added/deleted rows, column changes, and validation notices.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolCdpgReport1Page({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GtfsDiffCdpgReport1View />;
}
