'use client';

import {
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ChevronRight } from '@mui/icons-material';
import React, { useEffect } from 'react';
import { Link, useRouter } from '../../../../../i18n/navigation';
import type { DiffDataset } from '../../lib/datasets';
import { parseHash, toFocusHash } from '../../lib/diff-nav';
import {
  type ReportHighlight,
  type ReportSection,
  type ReportSummary,
} from '../../lib/report';
import { highlightsHref, sectionPageHref } from '../../lib/highlight-links';
import { SeverityIcon } from '../highlights/HighlightRow';
import ReportLayout from './ReportLayout';
import { SUMMARY_SECTION, sectionHref } from './ReportHeader';

const MONO_FONT = 'var(--font-ibm-plex-mono)';

/** Where the summary sends a section: trips open in the new (v2) view. */
function summaryHref(dataset: DiffDataset, section: ReportSection): string {
  const href = sectionHref(dataset.id, section);
  return section.id === 'trips' && dataset.files.trips ? `${href}-v2` : href;
}

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

/**
 * The most concerning changes across every file, from the diff's global
 * ranking (lib/global-highlights): the top few, then the highlights page.
 */
function NotableHighlightsSummary({
  dataset,
  report,
}: {
  dataset: DiffDataset;
  report: ReportSummary;
}): React.ReactElement | null {
  const router = useRouter();
  const h = report.highlights;
  // Only the global ranking carries a total; older reports had none.
  if (h?.total == null) return null;
  const label = (id: string): string =>
    report.sections.find((s) => s.id === id)?.label ?? id;
  return (
    <Box sx={cardSx}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          mb: 0.5,
        }}
      >
        <Typography variant='subtitle1' fontWeight={700}>
          Notable highlights
        </Typography>
        {h.counts.error > 0 ? (
          <OutlinedCount
            label={`${h.counts.error} critical`}
            color={COLORS.deleted}
          />
        ) : null}
        {h.counts.warning > 0 ? (
          <OutlinedCount
            label={`${h.counts.warning} warning${h.counts.warning === 1 ? '' : 's'}`}
            color={COLORS.modified}
          />
        ) : null}
      </Box>
      {h.top.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          Nothing concerning stood out.
        </Typography>
      ) : (
        <Box component='ol' sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {h.top.map((item: ReportHighlight) => (
            // Whole row opens the entity, like the Diff Summary's rows; the
            // link stays for keyboard users.
            <Box
              component='li'
              key={item.key ?? item.title}
              onClick={() =>
                router.push(sectionPageHref(dataset.id, item.section))
              }
              sx={{
                display: 'flex',
                gap: 1.25,
                py: 1,
                px: 1,
                mx: -1,
                alignItems: 'center',
                cursor: 'pointer',
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-of-type': { borderBottom: 0 },
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <SeverityIcon
                severity={item.severity === 'error' ? 'error' : 'warning'}
              />
              <Typography variant='body2' sx={{ minWidth: 0, flex: 1 }}>
                <Box
                  component='span'
                  sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.75 }}
                >
                  [{label(item.section)}]
                </Box>
                <Box component='span' sx={{ fontWeight: 700 }}>
                  {item.title}
                </Box>
              </Typography>
              <Typography
                component={Link}
                href={sectionPageHref(dataset.id, item.section)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                variant='body2'
                color='primary'
                sx={{
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {label(item.section)} →
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {h.total > 0 ? (
        <Button
          component={Link}
          href={highlightsHref(dataset.id)}
          variant='outlined'
          sx={{ mt: 1.5, textTransform: 'none' }}
        >
          View all {h.total.toLocaleString()} highlight
          {h.total === 1 ? '' : 's'}
        </Button>
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
      <NotableHighlightsSummary dataset={dataset} report={report} />
      <SummaryTable dataset={dataset} report={report} />
    </ReportLayout>
  );
}
