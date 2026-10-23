'use client';

import { Box, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { RouteDirDiff, TripPair } from '../../lib/trips-types';
import {
  type PairRowTimes,
  type TimetableColumn,
  formatTime,
  isNextDay,
  pairRowTimes,
  pairSummary,
  timepointRows,
  timetableColumns,
} from '../../lib/trips-utils';
import { isWeakMatch, tripBadge } from '../../lib/trips-v2-summary';
import { MONO_FONT } from '../trips/shared';
import {
  ADDED,
  ADDED_BG,
  CHANGED_BG,
  REMOVED,
  REMOVED_BG,
  pairTone,
} from './shared';

/** Trip columns rendered at first; busy routes run hundreds of trips. */
const PAGE = 40;

interface TimetableGridProps {
  route: RouteDirDiff;
  pairs: TripPair[];
  stopNames: Record<string, string>;
  selectedKey: string | null;
  onSelect: (pair: TripPair) => void;
  /** Expand every run of unchanged trips. */
  showUnchanged: boolean;
}

/**
 * Cells are plain table elements styled by class from the table's own sx:
 * a busy route is thousands of cells, too many for one styled component
 * (and one tooltip) each.
 */
const tableSx = {
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontFamily: MONO_FONT,
  fontSize: '0.72rem',
  '& th, & td': {
    px: 0.75,
    py: 0.4,
    textAlign: 'center',
    borderBottom: '1px solid',
    borderColor: 'divider',
    whiteSpace: 'nowrap',
    minWidth: 58,
    cursor: 'pointer',
  },
  '& th': { verticalAlign: 'top', fontWeight: 700 },
  '& .stop': {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    bgcolor: 'background.paper',
    borderRight: '1px solid',
    borderRightColor: 'divider',
    textAlign: 'left',
    fontFamily: 'body1.fontFamily',
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'default',
  },
  '& th.stop': { zIndex: 3, color: 'text.secondary', fontWeight: 400 },
  '& .fold': {
    bgcolor: 'action.hover',
    color: 'text.secondary',
    fontFamily: 'body1.fontFamily',
    fontWeight: 400,
    verticalAlign: 'middle',
    px: 1.5,
    cursor: 'default',
  },
  '& .fold b': { display: 'block' },
  '& .fold button, & .more button': {
    mt: 0.5,
    p: 0,
    border: 0,
    bgcolor: 'transparent',
    color: 'primary.main',
    cursor: 'pointer',
    font: 'inherit',
    textDecoration: 'underline',
  },
  '& .more': { verticalAlign: 'middle', cursor: 'default' },
  '& .removed': { bgcolor: REMOVED_BG },
  '& .added': { bgcolor: ADDED_BG },
  '& td.changed': { bgcolor: CHANGED_BG },
  '& .minor': { opacity: 0.6 },
  '& .selected': {
    boxShadow:
      'inset 2px 0 0 var(--mui-palette-text-primary), inset -2px 0 0 var(--mui-palette-text-primary)',
  },
  '& .strike': { textDecoration: 'line-through' },
  '& .old': { display: 'block', color: 'text.secondary', fontSize: '0.62rem' },
  '& .new': { display: 'block', fontWeight: 700 },
  '& .gone': { color: REMOVED },
  '& .now': { color: ADDED, fontWeight: 700 },
  '& .dot': { color: 'text.disabled' },
  '& sup': { fontSize: '0.6em', ml: 0.25, color: 'text.secondary' },
  '& .badge': {
    display: 'inline-block',
    mt: 0.25,
    px: 0.6,
    borderRadius: '3px',
    color: '#fff',
    fontSize: '0.6rem',
    lineHeight: '15px',
    fontFamily: 'body1.fontFamily',
  },
  '& .badge.removed': { bgcolor: REMOVED },
  '& .badge.added': { bgcolor: ADDED },
  '& .badge.changed': { bgcolor: '#3e2a00' },
  '& .badge.quiet': { bgcolor: 'action.selected', color: 'text.secondary' },
} as const;

function T({
  sec,
  strike = false,
}: {
  sec: number | null | undefined;
  strike?: boolean;
}): React.ReactElement {
  return (
    <span className={strike ? 'strike' : undefined}>
      {formatTime(sec)}
      {isNextDay(sec) ? <sup>+1</sup> : null}
    </span>
  );
}

/**
 * Printed-timetable layout: one column per trip, one row per timepoint stop.
 * Changed times show the old time struck through above the new one; runs of
 * unchanged trips fold into one column.
 */
export default function TimetableGrid({
  route,
  pairs,
  stopNames,
  selectedKey,
  onSelect,
  showUnchanged,
}: TimetableGridProps): React.ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => timepointRows(route), [route]);
  const all = useMemo<TimetableColumn[]>(
    () =>
      showUnchanged
        ? pairs.map((pair) => ({ kind: 'trip', pair }))
        : timetableColumns(pairs, expanded),
    [pairs, expanded, showUnchanged],
  );
  // Keep the selected trip's column on screen even past the limit.
  const selectedAt = all.findIndex(
    (c) => c.kind === 'trip' && c.pair.key === selectedKey,
  );
  const shownCount = Math.max(limit, selectedAt + 1);
  const columns = useMemo(() => all.slice(0, shownCount), [all, shownCount]);
  const hidden = all.length - columns.length;
  const times = useMemo(() => {
    const m = new Map<string, PairRowTimes>();
    for (const c of columns)
      if (c.kind === 'trip')
        m.set(c.pair.key, pairRowTimes(c.pair, route.stop_order));
    return m;
  }, [columns, route.stop_order]);
  const expand = (key: string): void =>
    setExpanded((s) => new Set([...s, key]));

  if (pairs.length === 0)
    return (
      <Typography variant='body2' color='text.secondary'>
        No trips start in the selected period.
      </Typography>
    );

  return (
    <Box
      sx={{
        overflowX: 'auto',
      }}
    >
      <Box component='table' sx={tableSx}>
        <thead>
          <tr>
            <th className='stop'>
              {rows.length < route.stop_order.length
                ? 'Timepoint stop'
                : 'Stop'}
            </th>
            {columns.map((c) =>
              c.kind === 'fold' ? (
                <th key={c.key} className='fold' rowSpan={rows.length + 1}>
                  <b>{c.pairs.length} unchanged</b>
                  <T sec={c.pairs[0].time} />–
                  <T sec={c.pairs[c.pairs.length - 1].time} />
                  <br />
                  <button type='button' onClick={() => expand(c.key)}>
                    Show
                  </button>
                </th>
              ) : (
                <HeaderCell
                  key={c.pair.key}
                  pair={c.pair}
                  selected={c.pair.key === selectedKey}
                  onClick={() => onSelect(c.pair)}
                />
              ),
            )}
            {hidden > 0 ? (
              <th className='more fold' rowSpan={rows.length + 1}>
                <b>{hidden} more</b>
                <button type='button' onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, hidden)} more
                </button>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stopId = route.stop_order[row];
            return (
              <tr key={row}>
                <td
                  className='stop'
                  title={`${stopNames[stopId] ?? stopId} (${stopId})`}
                >
                  {stopNames[stopId] ?? stopId}
                </td>
                {columns.map((c) =>
                  c.kind === 'fold' ? null : (
                    <TimeCell
                      key={c.pair.key}
                      pair={c.pair}
                      t={times.get(c.pair.key)}
                      row={row}
                      selected={c.pair.key === selectedKey}
                      onClick={() => onSelect(c.pair)}
                    />
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

function columnClass(pair: TripPair, selected: boolean): string {
  return [
    pair.cls === 'removed' && 'removed',
    pair.cls === 'added' && 'added',
    pair.minor && 'minor',
    selected && 'selected',
  ]
    .filter(Boolean)
    .join(' ');
}

function HeaderCell({
  pair,
  selected,
  onClick,
}: {
  pair: TripPair;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const badge = tripBadge(pair);
  return (
    <th
      className={columnClass(pair, selected)}
      title={`${pairSummary(pair)} · select for the trip detail`}
      onClick={onClick}
    >
      <T
        sec={pair.new_time ?? pair.base_time}
        strike={pair.cls === 'removed'}
      />
      {badge ? (
        <>
          <br />
          <span className={`badge ${pairTone(pair)}`}>{badge}</span>
        </>
      ) : null}
      {isWeakMatch(pair) ? (
        <>
          <br />
          <span className='badge quiet'>id match</span>
        </>
      ) : null}
    </th>
  );
}

function TimeCell({
  pair,
  t,
  row,
  selected,
  onClick,
}: {
  pair: TripPair;
  t: PairRowTimes | undefined;
  row: number;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const b = t?.base[row] ?? null;
  const n = t?.new[row] ?? null;
  const bServed = t?.baseServed[row] ?? false;
  const nServed = t?.newServed[row] ?? false;
  let cls = columnClass(pair, selected);
  let title: string | undefined;
  let content: React.ReactNode = <span className='dot'>·</span>;
  if (pair.cls === 'removed') {
    if (bServed)
      content = (
        <span className='gone'>
          <T sec={b} strike />
        </span>
      );
  } else if (pair.cls === 'added') {
    if (nServed) content = <T sec={n} />;
  } else if (bServed && nServed) {
    if (b === n || b == null || n == null) content = <T sec={n ?? b} />;
    else {
      if (!pair.minor) cls += ' changed';
      content = (
        <>
          <span className='old'>
            <T sec={b} strike />
          </span>
          <span className='new'>
            <T sec={n} />
          </span>
        </>
      );
    }
  } else if (nServed) {
    cls += ' added';
    title = 'Now stops here';
    content = (
      <span className='now'>
        +<T sec={n} />
      </span>
    );
  } else if (bServed) {
    cls += ' removed';
    title = 'No longer stops here';
    content = (
      <span className='gone'>
        <T sec={b} strike />
      </span>
    );
  }
  return (
    <td className={cls} title={title} onClick={onClick}>
      {content}
    </td>
  );
}
