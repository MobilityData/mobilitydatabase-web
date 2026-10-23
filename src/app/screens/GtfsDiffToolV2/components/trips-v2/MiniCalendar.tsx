'use client';

import { Box, IconButton, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import React, { useState } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  MONTH_NAMES,
  type MonthCursor,
  cursorOf,
  formatGtfsDate,
  monthGrid,
  shiftMonth,
} from '../../lib/calendar-utils';
import type { DayKind } from '../../lib/trips-v2-days';
import { CHANGED } from './shared';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const KIND_TEXT: Record<DayKind, string> = {
  typical: 'Typical day: runs its day type’s usual schedule in both feeds',
  different: 'Special day the two feeds run differently',
  check: 'Special day with a schedule of its own in both feeds',
  same: 'Special day running the same typical schedule in both feeds',
  none: 'No service in either feed',
  one_feed: 'Only one feed covers this date',
  unique: 'Runs its own set of services (no day pattern repeats in this feed)',
};

interface MiniCalendarProps {
  kindOf: Record<GtfsDate, DayKind>;
  /** Selected date, if the comparison is a single date. */
  value: GtfsDate | null;
  /** Dates sharing the selected special day's schedule. */
  related: ReadonlySet<GtfsDate>;
  first: GtfsDate;
  last: GtfsDate;
  onSelect: (date: GtfsDate) => void;
}

/**
 * One month at a time, Monday first. Each date is marked by what kind of day
 * it is (shape, not only colour, tells the kinds apart; see the legend).
 */
export default function MiniCalendar({
  kindOf,
  value,
  related,
  first,
  last,
  onSelect,
}: MiniCalendarProps): React.ReactElement {
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    cursorOf(value ?? first),
  );
  // Show the month of a date picked elsewhere (a special day, a day type).
  const [shownFor, setShownFor] = useState(value);
  if (value !== shownFor) {
    setShownFor(value);
    if (value != null) setCursor(cursorOf(value));
  }
  const min = cursorOf(first);
  const max = cursorOf(last);
  const index = (c: MonthCursor): number => c.year * 12 + c.month;

  return (
    <Box sx={{ width: '100%', maxWidth: 320 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <IconButton
          size='small'
          aria-label='Previous month'
          disabled={index(cursor) <= index(min)}
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
        >
          <ChevronLeft fontSize='small' />
        </IconButton>
        <Typography
          variant='body2'
          fontWeight={700}
          sx={{ flex: 1, textAlign: 'center' }}
        >
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </Typography>
        <IconButton
          size='small'
          aria-label='Next month'
          disabled={index(cursor) >= index(max)}
          onClick={() => setCursor((c) => shiftMonth(c, 1))}
        >
          <ChevronRight fontSize='small' />
        </IconButton>
      </Box>
      <Box
        role='grid'
        aria-label={`${MONTH_NAMES[cursor.month]} ${cursor.year}`}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '2px',
        }}
      >
        {WEEKDAYS.map((w, i) => (
          <Typography
            key={i}
            variant='caption'
            color='text.secondary'
            sx={{ textAlign: 'center', fontWeight: 600 }}
          >
            {w}
          </Typography>
        ))}
        {monthGrid(cursor)
          .flat()
          .map((d, i) =>
            d == null ? (
              <Box key={`pad-${i}`} />
            ) : (
              <DayCell
                key={d}
                date={d}
                kind={kindOf[d]}
                selected={d === value}
                related={related.has(d)}
                onSelect={onSelect}
              />
            ),
          )}
      </Box>
      <Legend />
    </Box>
  );
}

function DayCell({
  date,
  kind,
  selected,
  related,
  onSelect,
}: {
  date: GtfsDate;
  kind: DayKind | undefined;
  selected: boolean;
  related: boolean;
  onSelect: (d: GtfsDate) => void;
}): React.ReactElement {
  const disabled = kind == null || kind === 'none';
  return (
    <Box
      component='button'
      type='button'
      disabled={disabled}
      onClick={() => onSelect(date)}
      title={`${formatGtfsDate(date)} · ${kind ? KIND_TEXT[kind] : 'Not in either feed'}`}
      aria-pressed={selected}
      sx={{
        position: 'relative',
        height: 36,
        border: '1px solid',
        borderColor: related && !selected ? 'text.primary' : 'transparent',
        borderRadius: '4px',
        bgcolor: selected ? 'text.primary' : 'transparent',
        color: selected
          ? 'background.paper'
          : disabled
            ? 'text.disabled'
            : kind === 'one_feed'
              ? 'text.secondary'
              : 'text.primary',
        font: 'inherit',
        fontSize: '0.8rem',
        fontWeight: kind === 'different' ? 700 : 400,
        cursor: disabled ? 'default' : 'pointer',
        p: 0,
        '&:hover:not(:disabled)': {
          bgcolor: selected ? 'text.primary' : 'action.hover',
        },
      }}
    >
      {Number(date.slice(6, 8))}
      {kind ? <Marker kind={kind} /> : null}
    </Box>
  );
}

/** Mark under the day number: filled = different, ring = check, dot = same. */
function Marker({ kind }: { kind: DayKind }): React.ReactElement | null {
  const base = {
    position: 'absolute',
    left: '50%',
    bottom: 3,
    transform: 'translateX(-50%)',
    borderRadius: '50%',
  } as const;
  if (kind === 'different')
    return (
      <Box
        component='span'
        sx={{ ...base, width: 7, height: 7, bgcolor: CHANGED }}
      />
    );
  if (kind === 'check')
    return (
      <Box
        component='span'
        sx={{ ...base, width: 7, height: 7, border: `1.5px solid ${CHANGED}` }}
      />
    );
  if (kind === 'same')
    return (
      <Box
        component='span'
        sx={{ ...base, width: 4, height: 4, bgcolor: 'text.secondary' }}
      />
    );
  if (kind === 'one_feed')
    return (
      <Box
        component='span'
        sx={{
          ...base,
          width: 10,
          height: 0,
          borderRadius: 0,
          borderTop: '1.5px dashed',
          borderColor: 'text.disabled',
        }}
      />
    );
  return null;
}

function Legend(): React.ReactElement {
  const items: Array<[DayKind, string]> = [
    ['different', 'Run differently'],
    ['check', 'Own schedule in both'],
    ['same', 'Same typical schedule'],
    ['one_feed', 'One feed only'],
  ];
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
      {items.map(([k, label]) => (
        <Box
          key={k}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          title={KIND_TEXT[k]}
        >
          <Box sx={{ position: 'relative', width: 12, height: 12 }}>
            <Marker kind={k} />
          </Box>
          <Typography variant='caption' color='text.secondary'>
            {label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
