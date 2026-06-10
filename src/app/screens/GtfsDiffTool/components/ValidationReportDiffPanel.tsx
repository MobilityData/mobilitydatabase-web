'use client';

import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import {
  computeValidationReportDiff,
  type NoticeChange,
  type NoticeSeverity,
  type ValidationReport,
} from '../lib/validation-report-diff';

const MONO_FONT = 'var(--font-ibm-plex-mono)';

const SEVERITY_COLORS: Record<NoticeSeverity, string> = {
  ERROR: '#d32f2f',
  WARNING: '#ed6c02',
  INFO: '#0288d1',
};

const COLORS = {
  added: '#2e7d32',
  removed: '#d32f2f',
  changed: '#ed6c02',
  addedBg: 'rgba(46,125,50,.07)',
  removedBg: 'rgba(211,47,47,.07)',
  changedBg: 'rgba(237,108,2,.07)',
  // Semantic colors for specification compliance: green = good (issue fixed),
  // red = bad (new issue / more notices).
  good: '#2e7d32',
  bad: '#d32f2f',
  goodBg: 'rgba(46,125,50,.07)',
  badBg: 'rgba(211,47,47,.07)',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function SeverityChip({ severity }: { severity: NoticeSeverity }): React.ReactElement {
  return (
    <Chip
      label={severity}
      size='small'
      sx={{
        height: 18,
        fontSize: '0.6rem',
        fontWeight: 700,
        color: SEVERITY_COLORS[severity],
        border: `1px solid ${SEVERITY_COLORS[severity]}`,
        bgcolor: 'transparent',
      }}
    />
  );
}

interface SectionTitleProps {
  children: React.ReactNode;
}

function SectionTitle({ children }: SectionTitleProps): React.ReactElement {
  return (
    <Typography variant='body2' fontWeight={700} sx={{ mb: 1, mt: 0.5 }}>
      {children}
    </Typography>
  );
}

interface ValidationReportDiffPanelProps {
  baseReport: ValidationReport;
  newReport: ValidationReport;
}

export default function ValidationReportDiffPanel({
  baseReport,
  newReport,
}: ValidationReportDiffPanelProps): React.ReactElement {
  const diff = useMemo(
    () => computeValidationReportDiff(baseReport, newReport),
    [baseReport, newReport],
  );
  const [open, setOpen] = useState(true);

  const { validatorVersion, features, notices, counts } = diff;
  const noChanges =
    features.added.length === 0 &&
    features.removed.length === 0 &&
    notices.added.length === 0 &&
    notices.removed.length === 0 &&
    notices.changed.length === 0 &&
    counts.length === 0 &&
    !validatorVersion.changed;

  // Ordered notice rows for the compliance table: added → removed → changed.
  const noticeRows: Array<{ kind: 'added' | 'removed' | 'changed'; change: NoticeChange }> = [
    ...notices.added.map((change) => ({ kind: 'added' as const, change })),
    ...notices.removed.map((change) => ({ kind: 'removed' as const, change })),
    ...notices.changed.map((change) => ({ kind: 'changed' as const, change })),
  ];

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: '6px',
        mb: 3,
        overflow: 'hidden',
      }}
    >
      {/* ── Header bar ── */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant='subtitle1' fontWeight={700}>
            Validation Report Diff
          </Typography>
          <Chip
            label={`Validator ${validatorVersion.newVersion}`}
            size='small'
            variant='outlined'
            sx={{ fontFamily: MONO_FONT, fontSize: '0.65rem' }}
          />
          {validatorVersion.changed && (
            <Chip
              label={`was ${validatorVersion.baseVersion}`}
              size='small'
              sx={{
                fontFamily: MONO_FONT,
                fontSize: '0.65rem',
                color: COLORS.changed,
                border: `1px solid ${COLORS.changed}`,
                bgcolor: 'transparent',
              }}
            />
          )}
          <Tooltip title={open ? 'Collapse' : 'Expand'}>
            <IconButton size='small' sx={{ p: 0.25, ml: 'auto' }} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
              {open ? <ExpandLess sx={{ fontSize: '1rem' }} /> : <ExpandMore sx={{ fontSize: '1rem' }} />}
            </IconButton>
          </Tooltip>
        </Box>
        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
          Comparing {fmtDate(diff.baseValidatedAt)} (older) → {fmtDate(diff.newValidatedAt)} (latest)
        </Typography>
      </Box>

      {/* ── Body ── */}
      <Collapse in={open}>
      <Box sx={{ p: 2 }}>
        {noChanges && (
          <Typography variant='body2' color='text.secondary'>
            No differences in GTFS features or specification compliance between the two reports.
          </Typography>
        )}

        {/* ── GTFS Features ── */}
        {(features.added.length > 0 || features.removed.length > 0) && (
          <Box sx={{ mb: 3 }}>
            <SectionTitle>GTFS Features</SectionTitle>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {features.added.map((f) => (
                <Chip
                  key={`a-${f}`}
                  label={`+ ${f}`}
                  size='small'
                  sx={{ color: COLORS.added, border: `1px solid ${COLORS.added}`, bgcolor: 'transparent' }}
                />
              ))}
              {features.removed.map((f) => (
                <Chip
                  key={`r-${f}`}
                  label={`− ${f}`}
                  size='small'
                  sx={{ color: COLORS.removed, border: `1px solid ${COLORS.removed}`, bgcolor: 'transparent' }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* ── Entity counts ── */}
        {counts.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <SectionTitle>Entity Counts</SectionTitle>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {counts.map((c) => {
                const up = c.newValue > c.baseValue;
                const color = up ? COLORS.added : COLORS.removed;
                return (
                  <Chip
                    key={c.key}
                    label={`${c.key}: ${c.baseValue.toLocaleString()} → ${c.newValue.toLocaleString()} (${up ? '+' : ''}${(c.newValue - c.baseValue).toLocaleString()})`}
                    size='small'
                    sx={{
                      fontFamily: MONO_FONT,
                      fontSize: '0.65rem',
                      color,
                      border: `1px solid ${color}`,
                      bgcolor: 'transparent',
                    }}
                  />
                );
              })}
            </Box>
          </Box>
        )}

        {/* ── Specification compliance (notices) ── */}
        <Box>
          <SectionTitle>Specification Compliance</SectionTitle>

          {noticeRows.length === 0 ? (
            <Typography variant='body2' color='text.secondary'>
              No new, fixed, or changed notice codes.
            </Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                {notices.added.length > 0 && (
                  <Chip
                    label={`${notices.added.length} new code${notices.added.length > 1 ? 's' : ''}`}
                    size='small'
                    sx={{ color: COLORS.bad, border: `1px solid ${COLORS.bad}`, bgcolor: 'transparent' }}
                  />
                )}
                {notices.removed.length > 0 && (
                  <Chip
                    label={`${notices.removed.length} fixed code${notices.removed.length > 1 ? 's' : ''}`}
                    size='small'
                    sx={{ color: COLORS.good, border: `1px solid ${COLORS.good}`, bgcolor: 'transparent' }}
                  />
                )}
                {notices.changed.length > 0 && (
                  <Chip
                    label={`${notices.changed.length} changed count${notices.changed.length > 1 ? 's' : ''}`}
                    size='small'
                    sx={{ color: COLORS.changed, border: `1px solid ${COLORS.changed}`, bgcolor: 'transparent' }}
                  />
                )}
              </Box>

              <TableContainer>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                        Change
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                        Notice code
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                        Severity
                      </TableCell>
                      <TableCell align='right' sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                        Older
                      </TableCell>
                      <TableCell align='right' sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: 'background.paper' }}>
                        Latest
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {noticeRows.map(({ kind, change }) => {
                      // Semantics for spec compliance: a NEW notice code is bad,
                      // a removed code means the issue was fixed (good), and a
                      // changed count is colored by direction (fewer = better).
                      const isBad =
                        kind === 'added' ||
                        (kind === 'changed' && change.newCount > change.baseCount);
                      const bg = isBad ? COLORS.badBg : COLORS.goodBg;
                      const labelColor = isBad ? COLORS.bad : COLORS.good;
                      const label =
                        kind === 'added' ? 'New' : kind === 'removed' ? 'Fixed' : 'Count';
                      return (
                        <TableRow key={`${kind}-${change.code}`} sx={{ bgcolor: bg }}>
                          <TableCell sx={{ py: 0.5 }}>
                            <Typography
                              variant='caption'
                              sx={{ fontWeight: 700, color: labelColor, fontSize: '0.65rem' }}
                            >
                              {label}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', py: 0.5 }}>
                            {change.code}
                          </TableCell>
                          <TableCell sx={{ py: 0.5 }}>
                            <SeverityChip severity={change.severity} />
                          </TableCell>
                          <TableCell
                            align='right'
                            sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', py: 0.5, color: 'text.secondary' }}
                          >
                            {kind === 'added' ? '—' : change.baseCount.toLocaleString()}
                          </TableCell>
                          <TableCell
                            align='right'
                            sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', py: 0.5, fontWeight: 600 }}
                          >
                            {kind === 'removed' ? '—' : change.newCount.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      </Box>
      </Collapse>
    </Box>
  );
}
