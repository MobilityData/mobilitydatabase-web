'use client';

import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ChevronRight, ErrorOutline, WarningAmber } from '@mui/icons-material';
import React, { useEffect } from 'react';
import { Link, useRouter } from '../../../../../i18n/navigation';
import type { DiffDataset } from '../../lib/datasets';
import { parseHash, toFocusHash } from '../../lib/diff-nav';
import {
  type ReportHighlight,
  type ReportSection,
  type ReportSummary,
} from '../../lib/report';
import ReportLayout from './ReportLayout';
import { SUMMARY_SECTION, sectionHref } from './ReportHeader';

const MONO_FONT = 'var(--font-ibm-plex-mono)';

/** Where the summary sends a section: trips open in the new (v2) view. */
function summaryHref(dataset: DiffDataset, section: ReportSection): string {
  const href = sectionHref(dataset.id, section);
  return section.id === 'trips' && dataset.files.trips ? `${href}-v2` : href;
}

/**
 * Breaking & suspicious changes will come from rules that are still to be
 * defined. Until then the panel stays hidden; it currently lists the entity
 * generator's calendar highlights (report.highlights) as a placeholder.
 */
const SHOW_BREAKING_CHANGES = false;

const COLORS = {
  added: '#2e7d32',
  deleted: '#d32f2f',
  modified: '#ed6c02',
  unchanged: '#757575',
};

const cardSx = {
  bgcolor: 'background.paper',
  borderRadius: '6px',
  p: 2.5,
  mb: 3,
} as const;

function fmt(n: number | undefined): string {
  return n == null || n === 0 ? '—' : n.toLocaleString();
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function OutlinedCount({
  label,
  color,
}: {
  label: string;
  color: string;
}): React.ReactElement {
  return (
    <Chip
      label={label}
      size='small'
      sx={{
        color,
        border: `1px solid ${color}`,
        bgcolor: 'transparent',
        fontWeight: 600,
      }}
    />
  );
}

function BreakingChanges({
  dataset,
  report,
}: {
  dataset: DiffDataset;
  report: ReportSummary;
}): React.ReactElement | null {
  const h = report.highlights;
  if (h == null || h.top.length === 0) return null;
  const sectionOf = (id: string): ReportSection | undefined =>
    report.sections.find((s) => s.id === id);
  const more = h.counts.error + h.counts.warning - h.top.length;
  return (
    <Box sx={cardSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant='subtitle1' fontWeight={700}>
          Breaking &amp; Suspicious Changes
        </Typography>
        {h.counts.error > 0 ? (
          <OutlinedCount
            label={`${h.counts.error} critical`}
            color={COLORS.deleted}
          />
        ) : null}
        {h.counts.warning > 0 ? (
          <OutlinedCount
            label={`${h.counts.warning} warnings`}
            color={COLORS.modified}
          />
        ) : null}
      </Box>
      <Box component='ul' sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {h.top.map((item: ReportHighlight, i) => {
          const s = sectionOf(item.section);
          const error = item.severity === 'error';
          return (
            <Box
              component='li'
              key={i}
              sx={{ display: 'flex', gap: 1.25, py: 1, alignItems: 'start' }}
            >
              {error ? (
                <ErrorOutline sx={{ color: COLORS.deleted, mt: 0.25 }} />
              ) : (
                <WarningAmber sx={{ color: COLORS.modified, mt: 0.25 }} />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography variant='body2' fontWeight={700}>
                  {item.title}
                </Typography>
                {item.detail ? (
                  <Typography variant='body2' color='text.secondary'>
                    {item.detail}
                  </Typography>
                ) : null}
              </Box>
              {s != null ? (
                <Typography
                  component={Link}
                  href={summaryHref(dataset, s)}
                  variant='body2'
                  color='primary'
                  sx={{
                    ml: 'auto',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  {s.label} →
                </Typography>
              ) : null}
            </Box>
          );
        })}
      </Box>
      {more > 0 ? (
        <Typography variant='caption' color='text.secondary'>
          {more} more in the Service calendar.
        </Typography>
      ) : null}
    </Box>
  );
}

function SummaryTable({
  dataset,
  report,
}: {
  dataset: DiffDataset;
  report: ReportSummary;
}): React.ReactElement {
  const router = useRouter();
  const present = report.sections.filter((s) => s.present);
  const absent = report.sections.filter((s) => !s.present);
  const changed = present.filter((s) => (s.count ?? 0) > 0);
  const total = present.reduce((n, s) => n + (s.count ?? 0), 0);
  const num = (color: string): object => ({
    color,
    fontFamily: MONO_FONT,
    fontSize: '0.8rem',
  });

  return (
    <Box sx={cardSx}>
      <Typography variant='subtitle1' fontWeight={700} sx={{ mb: 1.5 }}>
        Diff Summary
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Typography variant='body2' fontWeight={700}>
          {total.toLocaleString()} total changes
        </Typography>
        <OutlinedCount
          label={`${changed.length} of ${present.length} entities changed`}
          color={COLORS.modified}
        />
      </Box>
      <TableContainer>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Entity</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell align='right' sx={{ fontWeight: 700 }}>
                Added
              </TableCell>
              <TableCell align='right' sx={{ fontWeight: 700 }}>
                Removed
              </TableCell>
              <TableCell align='right' sx={{ fontWeight: 700 }}>
                Modified
              </TableCell>
              <TableCell align='right' sx={{ fontWeight: 700 }}>
                Unchanged
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {present.map((s) => {
              const href = summaryHref(dataset, s);
              const isChanged = (s.count ?? 0) > 0;
              return (
                <TableRow
                  key={s.id}
                  hover
                  onClick={() => router.push(href)}
                  sx={{ cursor: 'pointer', '&:hover .open': { opacity: 1 } }}
                >
                  <TableCell>
                    <Typography
                      component={Link}
                      href={href}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      color='primary'
                      sx={{
                        fontWeight: 700,
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {s.label}
                    </Typography>
                    <Typography
                      variant='caption'
                      color='text.secondary'
                      component='div'
                      sx={{ fontFamily: MONO_FONT }}
                    >
                      {s.files.join(', ')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant='caption'
                      sx={{
                        color: isChanged ? COLORS.modified : COLORS.unchanged,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {isChanged ? 'Changed' : 'Unchanged'}
                    </Typography>
                  </TableCell>
                  <TableCell align='right' sx={num(COLORS.added)}>
                    {fmt(s.counts?.added)}
                  </TableCell>
                  <TableCell align='right' sx={num(COLORS.deleted)}>
                    {fmt(s.counts?.deleted)}
                  </TableCell>
                  <TableCell align='right' sx={num(COLORS.modified)}>
                    {fmt(s.counts?.modified)}
                  </TableCell>
                  <TableCell align='right' sx={num('text.secondary')}>
                    {fmt(s.counts?.unchanged)}
                  </TableCell>
                  <TableCell align='right' sx={{ width: 90 }}>
                    <Box
                      className='open'
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: 'primary.main',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        opacity: 0.7,
                      }}
                    >
                      Open
                      <ChevronRight fontSize='small' />
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
            {absent.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Typography color='text.disabled' fontWeight={700}>
                    {s.label}
                  </Typography>
                  <Typography
                    variant='caption'
                    color='text.disabled'
                    component='div'
                    sx={{ fontFamily: MONO_FONT }}
                  >
                    {s.files.join(', ')}
                  </Typography>
                </TableCell>
                <TableCell colSpan={6}>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.disabled',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    Not in either feed
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography
        variant='caption'
        color='text.secondary'
        component='div'
        sx={{ mt: 1.5 }}
      >
        Generated {fmtDate(report.generated_at)} · Routes count route impact
        (stops, path, trips, services), other entities count changed rows.
      </Typography>
    </Box>
  );
}

interface ReportSummaryViewProps {
  dataset: DiffDataset;
  report: ReportSummary;
}

/** /gtfs-diff-tool-v2/<dataset>: what changed, with a way into each entity. */
export default function ReportSummaryView({
  dataset,
  report,
}: ReportSummaryViewProps): React.ReactElement {
  const router = useRouter();

  // Links from before each entity had its own page: /<dataset>#routes/route/M1.
  useEffect(() => {
    const t = parseHash(window.location.hash);
    const s = t && report.sections.find((x) => x.id === t.tab && x.present);
    if (t != null && s != null) {
      router.replace(sectionHref(dataset.id, s) + toFocusHash(t));
    }
  }, []);

  return (
    <ReportLayout dataset={dataset} report={report} section={SUMMARY_SECTION}>
      {SHOW_BREAKING_CHANGES ? (
        <BreakingChanges dataset={dataset} report={report} />
      ) : null}
      <SummaryTable dataset={dataset} report={report} />
    </ReportLayout>
  );
}
