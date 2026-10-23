'use client';

import { Box, Chip, Typography } from '@mui/material';
import React from 'react';
import BreadcrumbNavigation, {
  type Crumb,
} from '../../../../components/BreadcrumbNavigation';
import type { DiffDataset } from '../../lib/datasets';
import {
  type ReportSection,
  type ReportSummary,
  feedLabel,
} from '../../lib/report';

/** Section id of the report's landing page. */
export const SUMMARY_SECTION = 'summary';

export function reportHref(datasetId: string): string {
  return `/gtfs-diff-tool-v2/${datasetId}`;
}

export function sectionHref(datasetId: string, section: ReportSection): string {
  return `${reportHref(datasetId)}/${section.slug}`;
}

export interface ReportHeaderProps {
  dataset: DiffDataset;
  report: ReportSummary;
  /** Id of the section this page shows, or SUMMARY_SECTION. */
  section: string;
  /** Extra chips next to the feeds (e.g. the selected station). */
  meta?: React.ReactNode;
  /** Line under the title (set by the page through useReportSubtitle). */
  subtitle?: string | null;
  /**
   * A page inside the section (e.g. one route of the trips view): the
   * section crumb links back to `href` and the title becomes `title`.
   */
  subpage?: { label: string; title: string; href: string };
}

/**
 * Header of every page of a diff report, laid out like the feed detail page:
 * back + breadcrumb, the entity as the title, then the compared feeds.
 * Entities are reached from the summary page (and back through the
 * breadcrumb), not from tabs.
 */
export default function ReportHeader({
  dataset,
  report,
  section,
  meta,
  subtitle,
  subpage,
}: ReportHeaderProps): React.ReactElement {
  const isSummary = section === SUMMARY_SECTION;
  const current = report.sections.find((s) => s.id === section);
  const sectionTitle = isSummary ? 'Summary' : (current?.label ?? section);
  const title = subpage?.title ?? sectionTitle;

  const crumbs: Crumb[] = [
    { label: 'GTFS diff', href: '/gtfs-diff-tool-v2' },
    isSummary
      ? { label: dataset.label }
      : { label: dataset.label, href: reportHref(dataset.id) },
  ];
  if (subpage) {
    crumbs.push({ label: sectionTitle, href: subpage.href });
    crumbs.push({ label: subpage.label });
  } else if (!isSummary) crumbs.push({ label: sectionTitle });

  return (
    <Box
      component='header'
      sx={{ borderBottom: 1, borderColor: 'divider', pb: 3 }}
    >
      <BreadcrumbNavigation
        crumbs={crumbs}
        backFallbackHref='/gtfs-diff-tool-v2'
      />
      <Typography
        component='h1'
        color='primary'
        sx={{
          mt: 1,
          fontWeight: 'bold',
          fontSize: { xs: 24, sm: 36 },
          lineHeight: 'normal',
        }}
      >
        {title}
      </Typography>
      {subtitle ? (
        <Typography
          component='h2'
          sx={{ fontWeight: 'bold', fontSize: { xs: 18, sm: 24 } }}
        >
          {subtitle}
        </Typography>
      ) : null}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
        <Chip size='small' color='primary' label={dataset.label} />
        <Chip
          size='small'
          variant='outlined'
          label={`Before · ${feedLabel(report.feeds.base)}`}
          title={report.feeds.base?.file}
        />
        <Chip
          size='small'
          variant='outlined'
          label={`After · ${feedLabel(report.feeds.new)}`}
          title={report.feeds.new?.file}
        />
        {meta}
      </Box>
    </Box>
  );
}
