'use client';

import { Alert, Box, Typography } from '@mui/material';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CalendarDiff,
  GtfsDate,
  RawTable,
} from '../../lib/entity-diff-types';
import {
  CHANGE_KINDS,
  CHANGE_LABELS,
  type CalendarFilters,
  DEFAULT_FILTERS,
  type DayCounts,
  type MonthCursor,
  cursorOf,
  shiftMonth,
} from '../../lib/calendar-utils';
import {
  type DayEntryRow,
  NO_KIND_COUNTS,
  dayCountsQuery,
  dayEntriesQuery,
  dayTotalQuery,
  kindCountsQuery,
  serviceIdsQuery,
  serviceRouteIdsQuery,
  toDayCounts,
  toDayEntryRow,
  toKindCounts,
} from '../../lib/calendar-query';
import {
  type CalendarUrls,
  calendarUrls,
  calendarKey,
  queryCalendar,
  useCalendarQuery,
} from '../../lib/useCalendarTables';
import { useCalendarPalette } from '../trips-v5/palette';
import { dayShade } from '../trips-v5/shared';
import CalendarFiltersBar from './CalendarFiltersBar';
import CalendarNavigator, { type CalendarView } from './CalendarNavigator';
import MonthView from './MonthView';
import YearView from './YearView';
import DayDetailsDialog from './DayDetailsDialog';
import ServiceChangesList from './ServiceChangesList';
import type { NavFocus } from '../../lib/diff-nav';
import { useRouter } from '../../../../../i18n/navigation';
import { SERVICE_PARAM, serviceHref } from '../../lib/service-detail';
import { useDayParam } from '../trips-v5/useOpenDay';
import EntityOverviewCard from '../overview/EntityOverviewCard';
import { DATE_HIGHLIGHTS } from '../../lib/calendar-overview-highlights';
import RawFileDiffCard from '../raw/RawFileDiffCard';

function minDate(...ds: Array<GtfsDate | null>): GtfsDate | null {
  const valid = ds.filter((d): d is GtfsDate => d != null).sort();
  return valid[0] ?? null;
}

function maxDate(...ds: Array<GtfsDate | null>): GtfsDate | null {
  const valid = ds.filter((d): d is GtfsDate => d != null).sort();
  return valid.at(-1) ?? null;
}

function LegendEntry({
  swatch,
  children,
}: React.PropsWithChildren<{ swatch: React.ReactNode }>): React.ReactElement {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {swatch}
      <Typography variant='caption'>{children}</Typography>
    </Box>
  );
}

/**
 * The change boxes' colours, days without service and the change shading,
 * like the Trips v5 calendar's legend.
 */
function Legend(): React.ReactElement {
  const palette = useCalendarPalette();
  const shadeScale = `linear-gradient(90deg, ${dayShade(palette, 0)}, ${dayShade(palette, 1)})`;
  return (
    <Box sx={{ display: 'grid', rowGap: 0.75 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 0.75,
        }}
      >
        <Typography variant='caption' color='text.secondary'>
          Services
        </Typography>
        {CHANGE_KINDS.map((k) => (
          <LegendEntry
            key={k}
            swatch={
              <Box
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '3px',
                  border: '1.5px solid',
                  borderColor: palette.change[k],
                }}
              />
            }
          >
            {CHANGE_LABELS[k]}
          </LegendEntry>
        ))}
        <LegendEntry
          swatch={
            <Box
              aria-hidden
              sx={{
                width: 10,
                height: 10,
                borderRadius: '3px',
                border: '1px dashed',
                borderColor: 'text.disabled',
              }}
            />
          }
        >
          No service
        </LegendEntry>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            ml: { sm: 'auto' },
          }}
        >
          <Typography variant='caption' color='text.secondary'>
            Services changed 0%
          </Typography>
          <Box
            aria-hidden
            sx={{
              width: 80,
              height: 10,
              borderRadius: '3px',
              border: '1px solid',
              borderColor: 'divider',
              backgroundImage: shadeScale,
            }}
          />
          <Typography variant='caption' color='text.secondary'>
            100%
          </Typography>
        </Box>
      </Box>
      <Typography variant='caption' color='text.secondary'>
        Bottom right of a day: its active services, before → after.
      </Typography>
    </Box>
  );
}

const NO_DAYS: Record<GtfsDate, DayCounts> = {};

const isGtfsDate = (d: string): boolean => /^\d{8}$/.test(d);
const NO_IDS: string[] = [];

interface CalendarEntityPanelProps {
  datasetId: string;
  calendar: CalendarDiff;
  /** Row diffs of the files that changed, as Parquet row tables. */
  rawTables: RawTable[];
  /** Cross-tab focus: a service to open, or a route to filter the calendar by. */
  focus: NavFocus | null;
}

export default function CalendarEntityPanel(
  props: CalendarEntityPanelProps,
): React.ReactElement {
  const urls = calendarUrls(props.datasetId, props.calendar);
  if (urls == null)
    return (
      <Alert severity='warning'>
        This diff was built with an older calendar layout. Rebuild it to see the
        service calendar (node scripts/build-gtfs-diff-dataset.mjs
        &lt;dataset&gt; --only entity,report).
      </Alert>
    );
  return <CalendarPanel {...props} urls={urls} />;
}

function CalendarPanel({
  datasetId,
  calendar,
  rawTables,
  focus,
  urls,
}: CalendarEntityPanelProps & { urls: CalendarUrls }): React.ReactElement {
  const { coverage } = calendar;
  const bounds = useMemo(
    () => ({
      start: minDate(coverage.base.start, coverage.new.start),
      end: maxDate(coverage.base.end, coverage.new.end),
    }),
    [coverage],
  );

  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<CalendarView>('month');
  const [focusedDate, setFocusedDate] = useState<GtfsDate | null>(null);
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    cursorOf(coverage.new.start ?? bounds.start ?? '20260101'),
  );
  // The open day is kept in ?day=, so Back from a service page reopens it.
  const {
    open: dialogDate,
    openDay: openDialog,
    navigateDay,
    closeDay,
  } = useDayParam(isGtfsDate, null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ── Derived data ─────────────────────────────────────────────────
  // Services and service-day changes live in analysis/services.parquet and
  // analysis/service_dates.parquet, their rows in the calendar raw tables:
  // the month / year counts, filter counts, service list and day details are
  // DuckDB queries (lib/calendar-query.ts).

  const tablesKey = calendarKey(urls);
  const filterKey = JSON.stringify(filters);
  const filteredDays =
    useCalendarQuery(
      urls,
      filterKey,
      (v) => dayCountsQuery(v, filters),
      toDayCounts,
    ).data ?? NO_DAYS;
  const changeDates = useMemo(
    () => Object.keys(filteredDays).sort(),
    [filteredDays],
  );

  const kindCounts =
    useCalendarQuery(
      urls,
      JSON.stringify({ ...filters, kinds: [] }),
      (v) => kindCountsQuery(v, filters),
      toKindCounts,
    ).data ?? NO_KIND_COUNTS;

  const serviceRouteIds =
    useCalendarQuery(
      urls,
      'routes',
      (v) => serviceRouteIdsQuery(v.services),
      (rows) => rows.map((r) => String(r.route_id)),
    ).data ?? NO_IDS;
  const routeIds = useMemo(
    () =>
      [...serviceRouteIds].sort((a, b) =>
        (calendar.routes[a]?.short_name || a).localeCompare(
          calendar.routes[b]?.short_name || b,
          undefined,
          { numeric: true },
        ),
      ),
    [serviceRouteIds, calendar.routes],
  );
  const serviceIds =
    useCalendarQuery(
      urls,
      'all',
      (v) => serviceIdsQuery(v.services),
      (rows) => rows.map((r) => String(r.service_id)),
    ).data ?? NO_IDS;

  // The open day's changes (with what the dialog shows of each service).
  const dialogKey = JSON.stringify([dialogDate, filters]);
  const [dialogData, setDialogData] = useState<{
    key: string;
    entries: DayEntryRow[];
    total: number;
  } | null>(null);
  useEffect(() => {
    if (dialogDate == null) return;
    let alive = true;
    Promise.all([
      queryCalendar(urls, (v) => dayEntriesQuery(v, dialogDate, filters)),
      queryCalendar(urls, (v) => dayTotalQuery(v.days, dialogDate)),
    ])
      .then(([rows, [t]]) => {
        if (!alive) return;
        setDialogData({
          key: dialogKey,
          entries: rows.map(toDayEntryRow),
          total: Number(t?.n ?? 0),
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [dialogKey, tablesKey]);
  const dialogReady = dialogData?.key === dialogKey;

  const prevDate = dialogDate
    ? (changeDates.findLast((d) => d < dialogDate) ?? null)
    : null;
  const nextDate = dialogDate
    ? (changeDates.find((d) => d > dialogDate) ?? null)
    : null;

  // ── Navigation ───────────────────────────────────────────────────

  const jumpToDate = useCallback((d: GtfsDate) => {
    setCursor(cursorOf(d));
    setFocusedDate(d);
  }, []);

  const openDay = useCallback(
    (d: GtfsDate) => {
      jumpToDate(d);
      openDialog(d);
    },
    [jumpToDate, openDialog],
  );

  // The calendar shows the open day's month (a day opened from the URL too).
  useEffect(() => {
    if (dialogDate != null) jumpToDate(dialogDate);
  }, [dialogDate]);

  const step = useCallback(
    (delta: number) =>
      setCursor((c) => shiftMonth(c, view === 'month' ? delta : delta * 12)),
    [view],
  );

  /** The year view only covers the diff's years: clamp into them. */
  const changeView = (next: CalendarView): void => {
    setView(next);
    if (next !== 'year') return;
    setCursor((c) => {
      if (bounds.start && c.year < cursorOf(bounds.start).year)
        return cursorOf(bounds.start);
      if (bounds.end && c.year > cursorOf(bounds.end).year)
        return cursorOf(bounds.end);
      return c;
    });
  };

  const scrollToCalendar = (): void => {
    calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** Apply filters and jump to the first matching change (or `preferred`). */
  const applyFiltersAndJump = (
    next: CalendarFilters,
    preferred?: GtfsDate,
  ): void => {
    setFilters(next);
    setView('month');
    scrollToCalendar();
    if (preferred) {
      jumpToDate(preferred);
      return;
    }
    queryCalendar(urls, (v) => dayCountsQuery(v, next))
      .then((rows) => {
        const first = rows[0]?.date;
        if (typeof first === 'string') jumpToDate(first);
      })
      .catch(() => undefined);
  };

  // ── Service linking ──────────────────────────────────────────────

  const openService = useCallback(
    (serviceId: string) => router.push(serviceHref(datasetId, serviceId)),
    [router, datasetId],
  );

  // ?service=<id> (a service page's "Show on calendar"): filter on it.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(SERVICE_PARAM);
    if (id) applyFiltersAndJump({ ...DEFAULT_FILTERS, serviceIds: [id] });
  }, []);

  // Cross-tab focus (from a route or stop elsewhere, or a deep link
  // #service/<id>): a service opens its page.
  useEffect(() => {
    if (focus?.id == null) return;
    if (focus.kind === 'service') {
      router.replace(serviceHref(datasetId, focus.id));
    } else if (focus.kind === 'route') {
      applyFiltersAndJump({ ...DEFAULT_FILTERS, routeIds: [focus.id] });
    }
    // Only react to new focus requests.
  }, [focus?.nonce]);

  return (
    <Box>
      <EntityOverviewCard
        datasetId={datasetId}
        highlights={[]}
        highlightsFile={calendar.highlights_file}
        noun={(h) => (DATE_HIGHLIGHTS.has(h.id) ? 'dates' : 'services')}
        openHint={(h) =>
          DATE_HIGHLIGHTS.has(h.id)
            ? 'select one to open the day'
            : 'select one to show its details'
        }
        onOpen={(h) =>
          DATE_HIGHLIGHTS.has(h.id)
            ? (d) => openDay(d)
            : (id) => openService(id)
        }
        emptyText={
          calendar.highlights_file
            ? 'Nothing concerning stood out: no day loses all service, no service is removed or runs on fewer days.'
            : 'Rebuild this dataset to compute the highlights (node scripts/build-gtfs-diff-dataset.mjs <dataset> --only entity,report).'
        }
      />

      <Box
        ref={calendarRef}
        sx={{
          bgcolor: 'background.paper',
          borderRadius: '6px',
          p: 2.5,
          mb: 3,
          scrollMarginTop: 80,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 2,
            flexWrap: 'wrap',
            mb: 2,
          }}
        >
          <Typography variant='subtitle1' fontWeight={700}>
            Service Dates
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            {calendar.total.base} → {calendar.total.new} services ·{' '}
            {changeDates.length} day{changeDates.length === 1 ? '' : 's'} with
            changes
          </Typography>
        </Box>

        <CalendarFiltersBar
          filters={filters}
          onChange={setFilters}
          kindCounts={kindCounts}
          routes={calendar.routes}
          routeIds={routeIds}
          serviceIds={serviceIds}
        />
        <CalendarNavigator
          view={view}
          onViewChange={changeView}
          cursor={cursor}
          onStep={step}
          focusedDate={focusedDate}
          onJumpToDate={jumpToDate}
          bounds={bounds}
        />

        {view === 'month' ? (
          <MonthView
            cursor={cursor}
            days={filteredDays}
            activeCounts={calendar.active_counts}
            focusedDate={focusedDate}
            onDayClick={openDay}
          />
        ) : (
          <YearView
            year={cursor.year}
            bounds={bounds}
            days={filteredDays}
            activeCounts={calendar.active_counts}
            focusedDate={focusedDate}
            onDayClick={openDay}
            onMonthClick={(c) => {
              setCursor(c);
              setView('month');
            }}
          />
        )}
        <Box sx={{ mt: 2 }}>
          <Legend />
        </Box>
      </Box>

      <Box
        sx={{ bgcolor: 'background.paper', borderRadius: '6px', p: 2.5, mb: 3 }}
      >
        <Typography variant='subtitle1' fontWeight={700} sx={{ mb: 2 }}>
          Services
        </Typography>
        <ServiceChangesList
          datasetId={datasetId}
          urls={urls}
          serviceIds={filters.serviceIds}
          routeIds={filters.routeIds}
          routes={calendar.routes}
        />
      </Box>

      {rawTables.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant='h6' fontWeight={700} sx={{ mb: 2 }}>
            Raw file diff
          </Typography>
          {rawTables.map((t) => (
            <RawFileDiffCard key={t.file} datasetId={datasetId} table={t} />
          ))}
        </Box>
      )}

      <DayDetailsDialog
        date={dialogDate}
        entries={dialogReady ? dialogData?.entries : undefined}
        loading={!dialogReady}
        unfilteredTotal={dialogReady ? (dialogData?.total ?? 0) : 0}
        activeCounts={
          dialogDate ? calendar.active_counts[dialogDate] : undefined
        }
        routes={calendar.routes}
        prevDate={prevDate}
        nextDate={nextDate}
        onNavigate={navigateDay}
        onClose={closeDay}
        onOpenService={openService}
      />
    </Box>
  );
}
