'use client';

import { Box } from '@mui/material';
import React, { useCallback, useMemo, useState } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import {
  type MonthCursor,
  cursorOf,
  shiftMonth,
} from '../../lib/calendar-utils';
import type { TripsCalendarDoc } from '../../lib/trips-calendar';
import { type ServicePeriod, periodByDate } from '../../lib/trips-periods';
import { clampToYears } from '../../lib/trips-v5-calendar';
import CalendarNavigator, {
  type CalendarView,
} from '../calendar/CalendarNavigator';
import TripsV5Legend from './TripsV5Legend';
import TripsV5MonthView from './TripsV5MonthView';
import TripsV5YearView from './TripsV5YearView';

interface TripsV5CalendarProps {
  calendar: TripsCalendarDoc;
  /** servicePeriods(calendar). */
  periods: ServicePeriod[];
  /** Periods singled out from the periods table (a row may cover several);
   * others dim. */
  hovered: readonly string[] | null;
  /** Day whose trips are open. */
  focused: GtfsDate | null;
  onOpen: (date: GtfsDate) => void;
}

/**
 * Trip changes by date, as a full calendar like the Service Dates page:
 * month / year views, previous / next, go to date, bounded by the compared
 * calendar. A day box shows its trips added, removed and modified, its kind
 * of day (how it differs from normal service) as a dot, the share of trips
 * changed and, on an exception, the schedule it runs. A day opens its trips.
 */
export default function TripsV5Calendar({
  calendar,
  periods,
  hovered,
  focused,
  onOpen,
}: TripsV5CalendarProps): React.ReactElement {
  const { first, last } = calendar;
  const bounds = useMemo(() => ({ start: first, end: last }), [first, last]);
  const byDate = useMemo(() => periodByDate(periods), [periods]);

  const [view, setView] = useState<CalendarView>('month');
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    cursorOf(focused ?? first),
  );
  // The day last opened or jumped to; outlined, and the date picker's value.
  const [marked, setMarked] = useState<GtfsDate | null>(focused);
  // Follow a day opened elsewhere (periods table, the popup's arrows).
  const [shownFor, setShownFor] = useState(focused);
  if (focused !== shownFor) {
    setShownFor(focused);
    if (focused != null) {
      setCursor(cursorOf(focused));
      setMarked(focused);
    }
  }

  const jumpToDate = useCallback((d: GtfsDate) => {
    setCursor(cursorOf(d));
    setMarked(d);
  }, []);

  const step = useCallback(
    (delta: number) =>
      setCursor((c) => shiftMonth(c, view === 'month' ? delta : delta * 12)),
    [view],
  );

  /** The year view only covers the calendar's years: clamp into them. */
  const changeView = (next: CalendarView): void => {
    setView(next);
    if (next === 'year') setCursor((c) => clampToYears(c, first, last));
  };

  const openMonth = useCallback((c: MonthCursor) => {
    setCursor(c);
    setView('month');
  }, []);

  return (
    <Box>
      <CalendarNavigator
        view={view}
        onViewChange={changeView}
        cursor={cursor}
        onStep={step}
        focusedDate={marked}
        onJumpToDate={jumpToDate}
        bounds={bounds}
      />
      {view === 'month' ? (
        <TripsV5MonthView
          calendar={calendar}
          byDate={byDate}
          cursor={cursor}
          hovered={hovered}
          marked={marked}
          onOpen={onOpen}
        />
      ) : (
        <TripsV5YearView
          year={cursor.year}
          calendar={calendar}
          byDate={byDate}
          hovered={hovered}
          marked={marked}
          onOpen={onOpen}
          onMonthClick={openMonth}
        />
      )}
      <TripsV5Legend />
    </Box>
  );
}
