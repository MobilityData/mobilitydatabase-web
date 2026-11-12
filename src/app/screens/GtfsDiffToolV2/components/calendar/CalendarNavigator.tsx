'use client';

import {
  Box,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { type Dayjs } from 'dayjs';
import React from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  MONTH_NAMES,
  type MonthCursor,
  parseGtfsDate,
  toGtfsDate,
} from '../../lib/calendar-utils';

export type CalendarView = 'month' | 'year';

function toDayjs(d: GtfsDate | null): Dayjs | null {
  if (d == null) return null;
  const { year, month, day } = parseGtfsDate(d);
  return dayjs(new Date(year, month, day));
}

interface CalendarNavigatorProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  cursor: MonthCursor;
  onStep: (delta: number) => void;
  focusedDate: GtfsDate | null;
  onJumpToDate: (date: GtfsDate) => void;
  /** Union of both feeds' service coverage. */
  bounds: { start: GtfsDate | null; end: GtfsDate | null };
}

export default function CalendarNavigator({
  view,
  onViewChange,
  cursor,
  onStep,
  focusedDate,
  onJumpToDate,
  bounds,
}: CalendarNavigatorProps): React.ReactElement {
  const unit = view === 'month' ? 'month' : 'year';
  const title =
    view === 'month'
      ? `${MONTH_NAMES[cursor.month]} ${cursor.year}`
      : String(cursor.year);
  // The year view stays within the years the diff covers.
  const startYear = bounds.start ? parseGtfsDate(bounds.start).year : null;
  const endYear = bounds.end ? parseGtfsDate(bounds.end).year : null;
  const canStepBack =
    view === 'month' || startYear == null || cursor.year > startYear;
  const canStepForward =
    view === 'month' || endYear == null || cursor.year < endYear;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        mb: 2,
      }}
    >
      <ToggleButtonGroup
        size='small'
        exclusive
        value={view}
        onChange={(_, v: CalendarView | null) => v && onViewChange(v)}
      >
        <ToggleButton value='month'>Month</ToggleButton>
        <ToggleButton value='year'>Year</ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Tooltip title={`Previous ${unit}`}>
          <span>
            <IconButton
              size='small'
              disabled={!canStepBack}
              onClick={() => onStep(-1)}
              aria-label={`Previous ${unit}`}
            >
              <ChevronLeft />
            </IconButton>
          </span>
        </Tooltip>
        <Typography
          variant='subtitle1'
          fontWeight={700}
          sx={{ minWidth: 150, textAlign: 'center' }}
        >
          {title}
        </Typography>
        <Tooltip title={`Next ${unit}`}>
          <span>
            <IconButton
              size='small'
              disabled={!canStepForward}
              onClick={() => onStep(1)}
              aria-label={`Next ${unit}`}
            >
              <ChevronRight />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <DatePicker
        label='Go to date'
        views={['year', 'month', 'day']}
        openTo='day'
        value={toDayjs(focusedDate)}
        minDate={toDayjs(bounds.start) ?? undefined}
        maxDate={toDayjs(bounds.end) ?? undefined}
        onChange={(v) => {
          if (v?.isValid())
            onJumpToDate(toGtfsDate(v.year(), v.month(), v.date()));
        }}
        slotProps={{ textField: { size: 'small', sx: { width: 180 } } }}
      />
    </Box>
  );
}
