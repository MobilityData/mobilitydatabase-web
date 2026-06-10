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
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CheckCircleOutline,
  ErrorOutline,
  ExpandLess,
  ExpandMore,
  WarningAmber,
} from '@mui/icons-material';
import React, { useState } from 'react';
import type {
  BreakingChangeEntry,
  BreakingChangeReport,
} from '../lib/breaking-changes-types';

const MONO_FONT = 'var(--font-ibm-plex-mono)';

const COLORS = {
  breaking: '#d32f2f',
  suspicious: '#ed6c02',
  passed: '#2e7d32',
  breakingBg: 'rgba(211,47,47,.07)',
  suspiciousBg: 'rgba(237,108,2,.07)',
};

function formatType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatCheckKey(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface ChangeCardProps {
  entry: BreakingChangeEntry;
  variant: 'breaking' | 'suspicious';
}

function ChangeCard({ entry, variant }: ChangeCardProps): React.ReactElement {
  const color = variant === 'breaking' ? COLORS.breaking : COLORS.suspicious;
  const bg = variant === 'breaking' ? COLORS.breakingBg : COLORS.suspiciousBg;

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: '6px',
        p: 1.5,
        mb: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
        <Chip
          label={formatType(entry.type)}
          size='small'
          sx={{ bgcolor: color, color: '#fff', fontWeight: 700, fontSize: '0.65rem' }}
        />
        <Chip
          label={entry.where}
          size='small'
          variant='outlined'
          sx={{ fontFamily: MONO_FONT, fontSize: '0.65rem' }}
        />
      </Box>
      <Typography variant='body2' sx={{ mt: 0.5 }}>
        {entry.detail}
      </Typography>
      {entry.note != null && (
        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.75 }}>
          {entry.note}
        </Typography>
      )}
    </Box>
  );
}

interface BreakingChangesPanelProps {
  report: BreakingChangeReport;
}

export default function BreakingChangesPanel({
  report,
}: BreakingChangesPanelProps): React.ReactElement {
  const { comparison, breaking_changes, suspicious_changes, checks_passed } = report;
  const [open, setOpen] = useState(true);
  const [checksOpen, setChecksOpen] = useState(false);

  const checkEntries = Object.entries(checks_passed);

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
            Breaking &amp; Suspicious Changes
          </Typography>
          {comparison.has_breaking_change && (
            <Chip
              icon={<ErrorOutline sx={{ fontSize: '1rem' }} />}
              label={`${breaking_changes.length} breaking`}
              size='small'
              sx={{ bgcolor: COLORS.breaking, color: '#fff', fontWeight: 700, fontSize: '0.65rem' }}
            />
          )}
          {comparison.has_suspicious_change && (
            <Chip
              icon={<WarningAmber sx={{ fontSize: '1rem' }} />}
              label={`${suspicious_changes.length} suspicious`}
              size='small'
              sx={{ bgcolor: COLORS.suspicious, color: '#fff', fontWeight: 700, fontSize: '0.65rem' }}
            />
          )}
          <Tooltip title={open ? 'Collapse' : 'Expand'}>
            <IconButton size='small' sx={{ p: 0.25, ml: 'auto' }} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
              {open ? <ExpandLess sx={{ fontSize: '1rem' }} /> : <ExpandMore sx={{ fontSize: '1rem' }} />}
            </IconButton>
          </Tooltip>
        </Box>
        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
          Comparing{' '}
          <Box component='span' sx={{ fontFamily: MONO_FONT }}>
            {comparison.old_feed_version}
          </Box>{' '}
          (old) →{' '}
          <Box component='span' sx={{ fontFamily: MONO_FONT }}>
            {comparison.new_feed_version}
          </Box>{' '}
          (new)
        </Typography>
      </Box>

      {/* ── Body ── */}
      <Collapse in={open}>
      <Box sx={{ p: 2 }}>
        {/* Breaking changes */}
        {breaking_changes.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <ErrorOutline sx={{ fontSize: '1.1rem', color: COLORS.breaking }} />
              <Typography variant='body2' fontWeight={700} sx={{ color: COLORS.breaking }}>
                Breaking Changes
              </Typography>
            </Box>
            {breaking_changes.map((entry, i) => (
              <ChangeCard key={`${entry.type}-${i}`} entry={entry} variant='breaking' />
            ))}
          </Box>
        )}

        {/* Suspicious changes */}
        {suspicious_changes.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <WarningAmber sx={{ fontSize: '1.1rem', color: COLORS.suspicious }} />
              <Typography variant='body2' fontWeight={700} sx={{ color: COLORS.suspicious }}>
                Suspicious Changes
              </Typography>
            </Box>
            {suspicious_changes.map((entry, i) => (
              <ChangeCard key={`${entry.type}-${i}`} entry={entry} variant='suspicious' />
            ))}
          </Box>
        )}

        {/* Checks passed (collapsible) */}
        {checkEntries.length > 0 && (
          <Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setChecksOpen((o) => !o)}
            >
              <CheckCircleOutline sx={{ fontSize: '1.1rem', color: COLORS.passed }} />
              <Typography variant='body2' fontWeight={700} sx={{ color: COLORS.passed }}>
                Checks Passed ({checkEntries.length})
              </Typography>
              <Tooltip title={checksOpen ? 'Collapse' : 'Expand'}>
                <IconButton size='small' sx={{ p: 0.25 }}>
                  {checksOpen ? (
                    <ExpandLess sx={{ fontSize: '1.1rem' }} />
                  ) : (
                    <ExpandMore sx={{ fontSize: '1.1rem' }} />
                  )}
                </IconButton>
              </Tooltip>
            </Box>
            <Collapse in={checksOpen}>
              <TableContainer
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '4px', mt: 1 }}
              >
                <Table size='small'>
                  <TableBody>
                    {checkEntries.map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell
                          sx={{
                            fontFamily: MONO_FONT,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            py: 0.75,
                            verticalAlign: 'top',
                            whiteSpace: 'nowrap',
                            width: '1%',
                          }}
                        >
                          {formatCheckKey(key)}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', py: 0.75 }}>{String(value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </Box>
        )}
      </Box>
      </Collapse>
    </Box>
  );
}
