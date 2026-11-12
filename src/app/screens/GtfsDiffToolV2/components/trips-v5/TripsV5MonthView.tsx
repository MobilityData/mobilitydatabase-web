'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import React, { useMemo } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  type MonthCursor,
  WEEKDAY_SHORT,
  MONTH_NAMES,
} from '../../lib/calendar-utils';
import type {
  TripChangeCounts,
  TripsCalendarDoc,
} from '../../lib/trips-calendar';
import type { ServicePeriod } from '../../lib/trips-periods';
import {
  type TripsDayCell,
  compactCount,
  dayAriaLabel,
  tripsMonthCells,
} from '../../lib/trips-v5-calendar';
import { dayKindOf } from '../../lib/trips-v5-day-kinds';
import type { CHANGE_COLORS } from '../trips-v3/shared';
import TripsV5DayTip from './TripsV5DayTip';
import { KindDot, dayShade } from './shared';
import { useCalendarPalette } from './palette';

// Day boxes adapt to the grid's width, not the viewport's: the calendar sits
// in a card beside the report's navigation.
const CONTAINER = 'trips-v5-month';
/** Under it the boxes are compact: short notes, compact counts. */
const NARROW = `@container ${CONTAINER} (max-width: 559px)`;
/** Under it the trips-per-day count in the corner is left out. */
const MID = `@container ${CONTAINER} (max-width: 759px)`;

const GRID_SX = {
  containerType: 'inline-size',
  containerName: CONTAINER,
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: '4px',
  '& .narrow': { display: 'none' },
  [MID]: { '& .roomy': { display: 'none' } },
  [NARROW]: {
    '& .wide': { display: 'none' },
    '& .narrow': { display: 'block' },
    '& [role="gridcell"]': { minHeight: 60, p: 0.5 },
  },
} as const;

const CELL_SX = {
  minHeight: 96,
  minWidth: 0,
  p: 1,
  borderRadius: '6px',
  bgcolor: 'action.hover',
  display: 'flex',
  flexDirection: 'column',
  gap: 0.25,
  overflow: 'hidden',
  transition: 'box-shadow 120ms, opacity 120ms',
  '& .day': { color: 'text.disabled' },
  '&[data-compared="true"]': {
    bgcolor: 'background.paper',
    cursor: 'pointer',
    '& .day': { color: 'text.primary' },
    '&:hover': { boxShadow: 2 },
  },
  '&[data-marked="true"]': {
    outline: '2px solid',
    outlineColor: 'primary.main',
  },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
} as const;

const NOTE_SX = {
  fontWeight: 700,
  lineHeight: 1.2,
  fontSize: '0.66rem',
  overflowWrap: 'anywhere',
} as const;

/** Sign before a count: trips added, removed; modified has none. */
const SIGN: Record<keyof typeof CHANGE_COLORS, string> = {
  added: '+',
  removed: '−',
  modified: '',
};

const CHANGE_BOXES: Array<[keyof typeof CHANGE_COLORS, string]> = [
  ['added', 'added'],
  ['removed', 'removed'],
  ['modified', 'modified'],
];

/**
 * Trips added, removed and modified as a row of outlined boxes in the
 * change colours, laid out like the Service Dates month view's
 * ChangeSquares; zeros left out.
 */
function ChangeBoxes({
  counts,
}: {
  counts: TripChangeCounts;
}): React.ReactElement {
  const { change } = useCalendarPalette();
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: 0.5,
      }}
    >
      {CHANGE_BOXES.filter(([kind]) => counts[kind] > 0).map(
        ([kind, label]) => (
          <Box
            key={kind}
            component='span'
            aria-label={`${counts[kind].toLocaleString()} trips ${label}`}
            sx={{
              minWidth: 22,
              height: 20,
              px: 0.5,
              borderRadius: '4px',
              border: '1px solid',
              borderColor: change[kind],
              color: change[kind],
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.68rem',
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              [NARROW]: { minWidth: 16, height: 16, fontSize: '0.6rem' },
            }}
          >
            {SIGN[kind]}
            {compactCount(counts[kind])}
          </Box>
        ),
      )}
    </Box>
  );
}

function DayBox({
  cell,
  dim,
  marked,
  onOpen,
}: {
  cell: TripsDayCell;
  dim: boolean;
  marked: boolean;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const { period: p, counts: c } = cell;
  const compared = p != null && c != null;
  const palette = useCalendarPalette();
  const shade = p ? dayShade(palette, p.share) : null;
  const kind = p ? dayKindOf(p) : null;
  // A day without service says so, unless it already notes the schedule it
  // runs.
  const none = kind === 'none' && !cell.note;
  const note = none ? 'No service' : cell.note;
  const shortNote = none ? 'No svc.' : cell.shortNote;
  return (
    <Tooltip title={<TripsV5DayTip cell={cell} />} placement='top'>
      <Box
        role='gridcell'
        tabIndex={compared ? 0 : -1}
        aria-label={dayAriaLabel(cell)}
        data-compared={compared}
        data-marked={marked}
        onClick={() => compared && onOpen(cell.date)}
        onKeyDown={(e) => {
          if (compared && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpen(cell.date);
          }
        }}
        style={{
          backgroundImage: shade
            ? `linear-gradient(${shade}, ${shade})`
            : undefined,
          opacity: dim ? 0.3 : undefined,
        }}
        sx={CELL_SX}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Typography
            className='day'
            variant='body2'
            fontWeight={700}
            lineHeight={1.5}
          >
            {cell.day}
          </Typography>
          {kind && kind !== 'typical' ? <KindDot kind={kind} /> : null}
        </Box>
        {note ? (
          <Typography variant='caption' component='div' sx={NOTE_SX}>
            <span className='wide'>{note}</span>
            <span className='narrow'>{shortNote}</span>
          </Typography>
        ) : null}
        {c ? (
          <Box
            sx={{
              mt: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 0.5,
            }}
          >
            <Typography
              className='roomy'
              variant='caption'
              color='text.secondary'
              sx={{ fontSize: '0.62rem', whiteSpace: 'nowrap', lineHeight: 1 }}
            >
              {c.base === c.new
                ? compactCount(c.new)
                : `${compactCount(c.base)}→${compactCount(c.new)}`}
            </Typography>
            {cell.changed > 0 ? <ChangeBoxes counts={c} /> : null}
          </Box>
        ) : null}
      </Box>
    </Tooltip>
  );
}

/**
 * A month of day boxes, like the Service Dates month view: each compared
 * day's kind (how it differs from normal service) as a dot, the box shaded
 * by the share of trips changed, its trips added / removed / modified in
 * coloured boxes, and the schedule an exception runs, or no service, noted.
 * A compared day opens its trips.
 */
export default function TripsV5MonthView({
  calendar,
  byDate,
  cursor,
  hovered,
  marked,
  onOpen,
}: {
  calendar: TripsCalendarDoc;
  byDate: Record<GtfsDate, ServicePeriod>;
  cursor: MonthCursor;
  /** Periods singled out from the periods table; others dim. */
  hovered: readonly string[] | null;
  marked: GtfsDate | null;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const cells = useMemo(
    () => tripsMonthCells(calendar, byDate, cursor),
    [calendar, byDate, cursor],
  );
  return (
    <Box
      role='grid'
      aria-label={`${MONTH_NAMES[cursor.month]} ${cursor.year}`}
      sx={GRID_SX}
    >
      {WEEKDAY_SHORT.map((w) => (
        <Typography
          key={w}
          variant='caption'
          color='text.secondary'
          sx={{ textAlign: 'center', pb: 0.5 }}
        >
          {w}
        </Typography>
      ))}
      {cells.map((cell, i) =>
        cell == null ? (
          <Box key={`pad-${i}`} />
        ) : (
          <DayBox
            key={cell.date}
            cell={cell}
            dim={hovered != null && !hovered.includes(cell.period?.id ?? '')}
            marked={cell.date === marked}
            onOpen={onOpen}
          />
        ),
      )}
    </Box>
  );
}
