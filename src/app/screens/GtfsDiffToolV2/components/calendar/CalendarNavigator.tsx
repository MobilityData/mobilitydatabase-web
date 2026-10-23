'use client';

import {
  Box,
  Button,
  ButtonGroup,
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
  formatGtfsDate,
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
  /** First and last date with a (filtered) change. */
  changeBounds: { first: GtfsDate | null; last: GtfsDate | null };
}

export default function CalendarNavigator({
  view,
  onViewChange,
  cursor,
  onStep,
  focusedDate,
  onJumpToDate,
  bounds,
  changeBounds,
}: CalendarNavigatorProps): React.ReactElement {
  const unit = view === 'month' ? 'month' : 'year';
  const title =
    view === 'month'
      ? `${MONTH_NAMES[cursor.month]} ${cursor.year}`
      : String(cursor.year);

  const jumpButton = (
    label: string,
    date: GtfsDate | null,
    tooltip: string,
  ): React.ReactElement => (
    <Tooltip
      title={date ? `${tooltip}: ${formatGtfsDate(date)}` : 'Not available'}
    >
      <span>
        <Button
          disabled={date == null}
          onClick={() => date && onJumpToDate(date)}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );

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
          <IconButton
            size='small'
            onClick={() => onStep(-1)}
            aria-label={`Previous ${unit}`}
          >
            <ChevronLeft />
          </IconButton>
        </Tooltip>
        <Typography
          variant='subtitle1'
          fontWeight={700}
          sx={{ minWidth: 150, textAlign: 'center' }}
        >
          {title}
        </Typography>
        <Tooltip title={`Next ${unit}`}>
          <IconButton
            size='small'
            onClick={() => onStep(1)}
            aria-label={`Next ${unit}`}
          >
            <ChevronRight />
          </IconButton>
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

      <ButtonGroup size='small' variant='outlined'>
        {jumpButton('Start', bounds.start, 'Feed calendar start')}
        {jumpButton('End', bounds.end, 'Feed calendar end')}
      </ButtonGroup>
      <ButtonGroup size='small' variant='outlined'>
        {jumpButton('First change', changeBounds.first, 'First change')}
        {jumpButton('Last change', changeBounds.last, 'Last change')}
      </ButtonGroup>
    </Box>
  );
}
