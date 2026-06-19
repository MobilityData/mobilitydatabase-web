import { type ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, routing } from '../../../../i18n/routing';
import { type Metadata } from 'next';
import GtfsDiffCdpgReport2View from '../../../screens/GtfsDiffTool/GtfsDiffCdpgReport2View';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'GTFS Change Tracker – BMTC Bengaluru (Report 2) | MobilityDatabase',
  description:
    'Diff report for BMTC (Bengaluru Metropolitan Transport Corporation), comparing the 2026-03-03 feed against the 2025-10-09 snapshot, including added/deleted rows, column changes, and validation notices.',
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return routing.locales.map((locale) => ({ locale }));
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GtfsDiffToolCdpgReport2Page({
  params,
}: PageProps): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GtfsDiffCdpgReport2View />;
}
