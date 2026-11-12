'use client';

import { ChevronRight, ExpandMore } from '@mui/icons-material';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React, { useCallback, useMemo, useState } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import type { ServicePeriod } from '../../lib/trips-periods';
import {
  type GroupCountKind,
  type GroupCountLabel,
  type GroupRowV2,
  periodGroupRowsV2,
} from '../../lib/trips-v5-period-groups-v2';
import { KindDot } from './shared';
import { useCalendarPalette } from './palette';

const COUNT_COLUMNS: Array<[GroupCountKind, string]> = [
  ['added', 'Added'],
  ['modified', 'Modified'],
  ['removed', 'Removed'],
];

const HEAD_SX = { fontWeight: 700, whiteSpace: 'nowrap' } as const;

/** Width of the expand chevron, so titles line up with or without one. */
const CHEVRON = 20;

interface ServicePeriodGroupsV2Props {
  periods: ServicePeriod[];
  /** Periods whose days the calendar singles out; null for none. */
  onHover: (ids: string[] | null) => void;
  /** Opens a day: a period's days all compare the same. */
  onOpen: (date: GtfsDate) => void;
}

/**
 * The trip calendar as service periods grouped by day kind: typical
 * schedules one row each, days running another day's schedule one row per
 * schedule, and one collapsed summary per other kind (no service first).
 * Counts are trips per day, a range when a group's periods differ.
 */
export default function ServicePeriodGroupsV2({
  periods,
  onHover,
  onOpen,
}: ServicePeriodGroupsV2Props): React.ReactElement {
  const rows = useMemo(() => periodGroupRowsV2(periods), [periods]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggle = useCallback((key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell sx={HEAD_SX}>Period</TableCell>
            <TableCell sx={HEAD_SX}>Service window</TableCell>
            <TableCell
              align='right'
              sx={HEAD_SX}
              title='Trips added, modified or removed out of every trip of the day'
            >
              Trip change
            </TableCell>
            {COUNT_COLUMNS.map(([kind, label]) => (
              <TableCell
                key={kind}
                align='right'
                sx={HEAD_SX}
                title={`Trips ${kind} per day`}
              >
                {label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const open = expanded.has(r.key);
            return (
              <React.Fragment key={r.key}>
                <GroupRow
                  row={r}
                  child={false}
                  expanded={r.children ? open : undefined}
                  onToggle={toggle}
                  onHover={onHover}
                  onOpen={onOpen}
                />
                {open && r.children
                  ? r.children.map((c) => (
                      <GroupRow
                        key={c.key}
                        row={c}
                        child
                        onToggle={toggle}
                        onHover={onHover}
                        onOpen={onOpen}
                      />
                    ))
                  : null}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

interface GroupRowProps {
  row: GroupRowV2;
  /** Indented under its summary row. */
  child: boolean;
  /** Set for rows that expand rather than open. */
  expanded?: boolean;
  onToggle: (key: string) => void;
  onHover: (ids: string[] | null) => void;
  onOpen: (date: GtfsDate) => void;
}

function GroupRow({
  row: r,
  child,
  expanded,
  onToggle,
  onHover,
  onOpen,
}: GroupRowProps): React.ReactElement {
  const expandable = expanded !== undefined;
  const activate = (): void => {
    if (expandable) onToggle(r.key);
    else if (r.openDate) onOpen(r.openDate);
  };
  const Chevron = expanded ? ExpandMore : ChevronRight;
  return (
    <TableRow
      hover
      tabIndex={0}
      aria-expanded={expandable ? expanded : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        activate();
      }}
      onMouseEnter={() => onHover(r.periodIds)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(r.periodIds)}
      onBlur={() => onHover(null)}
      sx={{
        cursor: 'pointer',
        verticalAlign: 'top',
        ...(child ? { bgcolor: 'action.hover' } : {}),
      }}
    >
      <TableCell
        sx={
          r.flagged && !child
            ? { boxShadow: (t) => `inset 3px 0 0 ${t.palette.error.main}` }
            : undefined
        }
      >
        <Box sx={{ display: 'flex', gap: 1, pl: child ? 4 : 0 }}>
          {child ? null : (
            <Box
              component='span'
              sx={{ width: CHEVRON, flexShrink: 0, display: 'flex' }}
            >
              {expandable ? (
                <Chevron fontSize='small' sx={{ color: 'text.secondary' }} />
              ) : null}
            </Box>
          )}
          <Box component='span' sx={{ pt: '4px' }}>
            <KindDot kind={r.kind} size={child ? 10 : 12} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant='body2' fontWeight={child ? 400 : 700}>
              {r.title}
            </Typography>
            {r.flagged && !child ? (
              <Typography variant='caption' color='error' component='div'>
                Check first: no trips in the new feed
              </Typography>
            ) : null}
            {r.note ? (
              <Typography
                variant='caption'
                color='text.secondary'
                component='div'
              >
                {r.note}
              </Typography>
            ) : null}
          </Box>
        </Box>
      </TableCell>
      <TableCell>
        <Typography variant='body2'>{r.window}</Typography>
        {r.days ? (
          <Typography variant='caption' color='text.secondary' component='div'>
            {r.days}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell align='right'>
        <Typography variant='body2' fontWeight={700} noWrap>
          {r.change}
        </Typography>
      </TableCell>
      {COUNT_COLUMNS.map(([kind]) => (
        <TableCell key={kind} align='right'>
          <CountCell kind={kind} value={r.counts[kind]} />
        </TableCell>
      ))}
    </TableRow>
  );
}

/** A count or range in its diff colour; all zero muted. */
function CountCell({
  kind,
  value,
}: {
  kind: GroupCountKind;
  value: GroupCountLabel;
}): React.ReactElement {
  const { change } = useCalendarPalette();
  return (
    <Typography
      variant='body2'
      noWrap
      sx={
        value.zero
          ? { color: 'text.disabled' }
          : { color: change[kind], fontWeight: 700 }
      }
    >
      {value.label}
    </Typography>
  );
}
