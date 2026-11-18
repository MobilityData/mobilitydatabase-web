'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import React, { useMemo } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  CHANGE_KINDS,
  type ChangeKind,
  type DayCounts,
  type MonthCursor,
  MONTH_NAMES,
  WEEKDAY_SHORT,
  changedShare,
  countsTotal,
  monthGrid,
  parseGtfsDate,
} from '../../lib/calendar-utils';
import { compactCount } from '../../lib/trips-v5-calendar';
import { useCalendarPalette } from '../trips-v5/palette';
import { dayShade } from '../trips-v5/shared';
import { ServiceDayTip } from './shared';

// Day boxes adapt to the grid's width, not the viewport's: the calendar sits
// in a card beside the report's navigation.
const CONTAINER = 'service-dates-month';
/** Under it the boxes are compact. */
const NARROW = `@container ${CONTAINER} (max-width: 559px)`;
/** Under it the active-services count in the corner is left out. */
const MID = `@container ${CONTAINER} (max-width: 759px)`;

const GRID_SX = {
  containerType: 'inline-size',
  containerName: CONTAINER,
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: '4px',
  [MID]: { '& .roomy': { display: 'none' } },
  [NARROW]: { '& [role="gridcell"]': { minHeight: 60, p: 0.5 } },
} as const;

const CELL_SX = {
  minHeight: 96,
  minWidth: 0,
  p: 1,
  borderRadius: '6px',
  // No service: an outline only. The card behind is the paper colour, so a
  // day with service gets a box of its own.
  border: '1px dashed',
  borderColor: 'divider',
  display: 'flex',
  flexDirection: 'column',
  gap: 0.25,
  overflow: 'hidden',
  transition: 'box-shadow 120ms',
  '& .day': { color: 'text.disabled' },
  '&[data-service="true"]': {
    border: 0,
    bgcolor: 'action.hover',
    '& .day': { color: 'text.primary' },
  },
  '&[data-changed="true"]': {
    cursor: 'pointer',
    '&:hover': { boxShadow: 2 },
  },
  '&[data-marked="true"]': {
    outline: '2px solid',
    outlineColor: 'primary.main',
  },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
} as const;

/** Sign before a count: services added, removed; modified has none. */
const SIGN: Record<ChangeKind, string> = {
  added: '+',
  removed: '−',
  modified: '',
};

/**
 * Services added, removed and modified as a row of outlined boxes in the
 * change colours, like the Trips v5 calendar's; zeros left out.
 */
function ChangeBoxes({ day }: { day: DayCounts }): React.ReactElement {
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
      {CHANGE_KINDS.filter((k) => day[k] > 0).map((k) => (
        <Box
          key={k}
          component='span'
          aria-label={`${day[k].toLocaleString()} services ${k}`}
          sx={{
            minWidth: 22,
            height: 20,
            px: 0.5,
            borderRadius: '4px',
            border: '1px solid',
            borderColor: change[k],
            color: change[k],
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
          {SIGN[k]}
          {compactCount(day[k])}
        </Box>
      ))}
    </Box>
  );
}

function DayBox({
  date,
  day,
  active,
  marked,
  onOpen,
}: {
  date: GtfsDate;
  day: DayCounts | undefined;
  active: [number, number];
  marked: boolean;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const palette = useCalendarPalette();
  const [base, next] = active;
  const total = countsTotal(day);
  const changed = total > 0;
  const shade = changed ? dayShade(palette, changedShare(total, active)) : null;
  return (
    <Tooltip
      title={<ServiceDayTip date={date} day={day} active={active} />}
      placement='top'
    >
      <Box
        role='gridcell'
        tabIndex={changed ? 0 : -1}
        aria-label={`${date}: ${total} service changes`}
        data-service={base + next > 0}
        data-changed={changed}
        data-marked={marked}
        onClick={() => changed && onOpen(date)}
        onKeyDown={(e) => {
          if (changed && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpen(date);
          }
        }}
        style={{
          backgroundImage: shade
            ? `linear-gradient(${shade}, ${shade})`
            : undefined,
        }}
        sx={CELL_SX}
      >
        <Typography
          className='day'
          variant='body2'
          fontWeight={700}
          lineHeight={1.5}
        >
          {parseGtfsDate(date).day}
        </Typography>
        {base + next > 0 || changed ? (
          <Box
            sx={{
              mt: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 0.5,
            }}
          >
            {base + next > 0 ? (
              <Typography
                className='roomy'
                variant='caption'
                color='text.secondary'
                sx={{
                  fontSize: '0.62rem',
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                }}
              >
                {base === next ? next : `${base}→${next}`}
              </Typography>
            ) : null}
            {day && changed ? <ChangeBoxes day={day} /> : null}
          </Box>
        ) : null}
      </Box>
    </Tooltip>
  );
}

interface MonthViewProps {
  cursor: MonthCursor;
  /** Change counts per kind of the dates with changes (filters applied). */
  days: Record<GtfsDate, DayCounts>;
  activeCounts: Record<GtfsDate, [number, number]>;
  focusedDate: GtfsDate | null;
  onDayClick: (date: GtfsDate) => void;
}

/**
 * A month of day boxes, laid out like the Trips v5 calendar: a day with
 * service in a box, shaded by the share of its services changed, with
 * its active services (before → after) and the services added / removed /
 * modified in outlined boxes at the bottom. A day with changes opens them.
 */
export default function MonthView({
  cursor,
  days,
  activeCounts,
  focusedDate,
  onDayClick,
}: MonthViewProps): React.ReactElement {
  const weeks = useMemo(() => monthGrid(cursor), [cursor]);
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
      {weeks
        .flat()
        .map((date, i) =>
          date == null ? (
            <Box key={`pad-${i}`} />
          ) : (
            <DayBox
              key={date}
              date={date}
              day={days[date]}
              active={activeCounts[date] ?? [0, 0]}
              marked={date === focusedDate}
              onOpen={onDayClick}
            />
          ),
        )}
    </Box>
  );
}
