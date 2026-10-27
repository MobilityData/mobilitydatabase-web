'use client';

import { Box, Typography } from '@mui/material';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CalendarDiff,
  FileDiff,
  GtfsDate,
} from '../../lib/entity-diff-types';
import {
  CHANGE_COLORS,
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
  toDayCounts,
  toDayEntryRow,
  toKindCounts,
} from '../../lib/calendar-query';
import {
  mapTableUrl,
  queryMapTable,
  queryMapTables,
  useMapTableQuery,
} from '../../lib/useMapTable';
import CalendarFiltersBar from './CalendarFiltersBar';
import CalendarNavigator, { type CalendarView } from './CalendarNavigator';
import MonthView from './MonthView';
import YearView from './YearView';
import DayDetailsDialog from './DayDetailsDialog';
import ServiceChangesList from './ServiceChangesList';
import { type NavFocus, useDiffNav } from '../../lib/diff-nav';
import EntityOverviewCard from '../overview/EntityOverviewCard';
import { DATE_HIGHLIGHTS } from '../../lib/calendar-overview-highlights';
import GtfsDiffFileDiffPanel from '../../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';

function minDate(...ds: Array<GtfsDate | null>): GtfsDate | null {
  const valid = ds.filter((d): d is GtfsDate => d != null).sort();
  return valid[0] ?? null;
}

function maxDate(...ds: Array<GtfsDate | null>): GtfsDate | null {
  const valid = ds.filter((d): d is GtfsDate => d != null).sort();
  return valid.at(-1) ?? null;
}

function Legend(): React.ReactElement {
  return (
    <Box
      sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
    >
      {CHANGE_KINDS.map((k) => (
        <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '2px',
              bgcolor: CHANGE_COLORS[k],
            }}
          />
          <Typography variant='caption'>{CHANGE_LABELS[k]} services</Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '2px',
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
          }}
        />
        <Typography variant='caption'>No service</Typography>
      </Box>
      <Typography variant='caption' color='text.secondary'>
        Top-right number: active services (before→after)
      </Typography>
    </Box>
  );
}

const NO_DAYS: Record<GtfsDate, DayCounts> = {};

interface CalendarEntityPanelProps {
  datasetId: string;
  calendar: CalendarDiff;
  fileDiffs: FileDiff[];
  /** Cross-tab focus: a service to open, or a route to filter the calendar by. */
  focus: NavFocus | null;
}

export default function CalendarEntityPanel({
  datasetId,
  calendar,
  fileDiffs,
  focus,
}: CalendarEntityPanelProps): React.ReactElement {
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
  const [dialogDate, setDialogDate] = useState<GtfsDate | null>(null);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(
    null,
  );
  /** A service opened from elsewhere: the list shows it alone. */
  const [focusServiceId, setFocusServiceId] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  const calendarRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);

  // ── Derived data ─────────────────────────────────────────────────
  // Services and service-day changes live in calendar/*.parquet: the
  // month / year counts, filter counts, service list and day details are
  // DuckDB queries (lib/calendar-query.ts).

  const daysUrl = mapTableUrl(datasetId, calendar.tables.days);
  const servicesUrl = mapTableUrl(datasetId, calendar.tables.services);
  const filterKey = JSON.stringify(filters);
  const filteredDays =
    useMapTableQuery(
      daysUrl,
      filterKey,
      (v) => dayCountsQuery(v, filters),
      toDayCounts,
    ).data ?? NO_DAYS;
  const changeDates = useMemo(
    () => Object.keys(filteredDays).sort(),
    [filteredDays],
  );

  const kindCounts =
    useMapTableQuery(
      daysUrl,
      JSON.stringify({ ...filters, kinds: [] }),
      (v) => kindCountsQuery(v, filters),
      toKindCounts,
    ).data ?? NO_KIND_COUNTS;

  const routeIds = useMemo(
    () =>
      [...calendar.route_ids].sort((a, b) =>
        (calendar.routes[a]?.short_name || a).localeCompare(
          calendar.routes[b]?.short_name || b,
          undefined,
          { numeric: true },
        ),
      ),
    [calendar.route_ids, calendar.routes],
  );
  const serviceIds =
    useMapTableQuery(servicesUrl, 'all', serviceIdsQuery, (rows) =>
      rows.map((r) => String(r.service_id)),
    ).data ?? [];

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
      queryMapTables([daysUrl, servicesUrl], ([d, sv]) =>
        dayEntriesQuery(d, sv, dialogDate, filters),
      ),
      queryMapTable(daysUrl, (v) => dayTotalQuery(v, dialogDate)),
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
  }, [dialogKey, daysUrl, servicesUrl]);
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
      setDialogDate(d);
    },
    [jumpToDate],
  );

  const step = useCallback(
    (delta: number) =>
      setCursor((c) => shiftMonth(c, view === 'month' ? delta : delta * 12)),
    [view],
  );

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
    queryMapTable(daysUrl, (v) => dayCountsQuery(v, next))
      .then((rows) => {
        const first = rows[0]?.date;
        if (typeof first === 'string') jumpToDate(first);
      })
      .catch(() => undefined);
  };

  // ── Service linking ──────────────────────────────────────────────

  const nav = useDiffNav();
  const focusService = useCallback(
    (serviceId: string) => {
      setDialogDate(null);
      setFocusServiceId(serviceId);
      setExpandedServiceId(serviceId);
      setScrollRequest((n) => n + 1);
      nav?.replaceTarget({ tab: 'calendar', kind: 'service', id: serviceId });
    },
    [nav],
  );

  useEffect(() => {
    if (scrollRequest === 0) return;
    // Wait for the dialog to close; the list then shows the service alone.
    const t = window.setTimeout(() => {
      servicesRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [scrollRequest]);

  // Deep link: /gtfs-diff-tool-v2#service-<service_id>
  // Cross-tab focus (from a route or stop elsewhere, or a deep link).
  useEffect(() => {
    if (focus?.id == null) return;
    if (focus.kind === 'service') {
      focusService(focus.id);
    } else if (focus.kind === 'route') {
      applyFiltersAndJump({ ...DEFAULT_FILTERS, routeIds: [focus.id] });
    }
    // Only react to new focus requests.
  }, [focus?.nonce]);

  return (
    <Box>
      <EntityOverviewCard
        highlights={calendar.overview_highlights ?? []}
        noun={(h) => (DATE_HIGHLIGHTS.has(h.id) ? 'dates' : 'services')}
        openHint={(h) =>
          DATE_HIGHLIGHTS.has(h.id)
            ? 'select one to open the day'
            : 'select one to show its details'
        }
        onOpen={(h) =>
          DATE_HIGHLIGHTS.has(h.id)
            ? (d) => openDay(d)
            : (id) => focusService(id)
        }
        emptyText={
          calendar.overview_highlights
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
          onViewChange={setView}
          cursor={cursor}
          onStep={step}
          focusedDate={focusedDate}
          onJumpToDate={jumpToDate}
          bounds={bounds}
          changeBounds={{
            first: changeDates[0] ?? null,
            last: changeDates.at(-1) ?? null,
          }}
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

      <Typography
        ref={servicesRef}
        variant='h6'
        fontWeight={700}
        sx={{ mb: 2, scrollMarginTop: 80 }}
      >
        Services
      </Typography>
      <ServiceChangesList
        datasetId={datasetId}
        table={calendar.tables.services}
        serviceIds={filters.serviceIds}
        routeIds={filters.routeIds}
        focusId={focusServiceId}
        onClearFocus={() => {
          setFocusServiceId(null);
          nav?.replaceTarget({ tab: 'calendar' });
        }}
        routes={calendar.routes}
        expandedId={expandedServiceId}
        onExpandedChange={setExpandedServiceId}
        onDateClick={(d) => {
          openDay(d);
        }}
        onShowOnCalendar={(id) =>
          applyFiltersAndJump({ ...DEFAULT_FILTERS, serviceIds: [id] })
        }
      />

      {fileDiffs.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant='h6' fontWeight={700} sx={{ mb: 2 }}>
            Raw file diff
          </Typography>
          <GtfsDiffFileDiffPanel fileDiffs={fileDiffs} />
        </Box>
      )}

      <DayDetailsDialog
        date={dialogDate}
        entries={dialogReady ? dialogData?.entries : undefined}
        entriesKey={dialogKey}
        loading={!dialogReady}
        unfilteredTotal={dialogReady ? (dialogData?.total ?? 0) : 0}
        activeCounts={
          dialogDate ? calendar.active_counts[dialogDate] : undefined
        }
        routes={calendar.routes}
        prevDate={prevDate}
        nextDate={nextDate}
        onNavigate={openDay}
        onClose={() => setDialogDate(null)}
        onServiceClick={focusService}
      />
    </Box>
  );
}
