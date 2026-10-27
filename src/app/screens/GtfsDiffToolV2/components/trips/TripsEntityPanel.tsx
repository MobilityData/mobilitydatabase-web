'use client';

import TransitLoader from '../TransitLoader';
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  EntityCategoryDiff,
  EntityTypeDiff,
  GtfsDate,
  RawTable,
} from '../../lib/entity-diff-types';
import RawTablesSection from '../raw/RawTablesSection';
import { RAW_DIFF_ID } from '../diffmap/DiffMapControls';
import type {
  RouteVerdict,
  TripPair,
  TripsDiffDoc,
} from '../../lib/trips-types';
import {
  DEFAULT_MINOR_THRESHOLD_S,
  TRIP_CLASSES,
  TRIP_CLASS_LABELS,
  VERDICTS,
  VERDICT_COLORS,
  VERDICT_LABELS,
  computeDayDiff,
  dateBounds,
  isChanged,
  servicesForDate,
} from '../../lib/trips-utils';
import { type NavFocus, useDiffNav } from '../../lib/diff-nav';
import { useDiffData } from '../../lib/useDiffData';
import {
  type TripsIndexDoc,
  isByRoute,
  routeDayCounts,
} from '../../lib/trips-shards';
import { useTripsDay } from '../../lib/useTripsDay';
import {
  type AnchorKey,
  feedCoverage,
  isCrossPeriod,
  periodDayTypes,
} from '../../lib/trips-anchor';
import { formatGtfsDate } from '../../lib/calendar-utils';
import DayPicker from './DayPicker';
import RouteDayList from './RouteDayList';
import RouteOverviewTable from './RouteOverviewTable';
import RouteView from './RouteView';
import StopBoard from './StopBoard';
import TechnicalDrilldown from './TechnicalDrilldown';
import TripDrawer from './TripDrawer';
import { CountChange } from './shared';

type Mode = 'routes' | 'stop';

const MINOR_OPTIONS = [0, 30, 60, 120, 300];

const cardSx = {
  bgcolor: 'background.paper',
  borderRadius: '6px',
  p: 2.5,
  mb: 3,
} as const;

interface TripsEntityPanelProps {
  /** Dataset folder whose trips-diff.json to load. */
  datasetId: string;
  /** trips.txt file-level diff, shown in the technical drill-down. */
  entityTypes: EntityTypeDiff[];
  /** Row-level diffs of trips.txt, stop_times.txt and frequencies.txt. */
  /** Full row tables of trips, stop_times, frequencies (Parquet). */
  rawTables?: RawTable[];
  tripMatching?: EntityCategoryDiff['trip_matching'];
  focus: NavFocus | null;
}

/**
 * Loads the trips payload lazily (it carries every trip's stop times) and
 * renders the day-anchored view, with the raw file diff below it. The raw
 * diff comes from entity-diff.json, so it shows while the trips load.
 */
export default function TripsEntityPanel({
  datasetId,
  entityTypes,
  rawTables = [],
  tripMatching,
  focus,
}: TripsEntityPanelProps): React.ReactElement {
  const { data: doc, error } = useDiffData<TripsIndexDoc>(datasetId, 'trips');
  // Large feeds are sharded per service: load the first day before showing it.
  const first = useTripsDay(datasetId, doc, doc ? defaultDate(doc) : null);

  let content: React.ReactElement;
  if (error != null || first.error != null)
    content = (
      <Alert severity='error' sx={{ mb: 3 }}>
        Could not load the trips data (trips-diff.json). Generate it with
        scripts/generate-gtfs-trips-diff.mjs.
      </Alert>
    );
  else if (doc == null || first.doc == null || first.date == null)
    content = <TransitLoader label='Loading trips…' />;
  else
    content = (
      <TripsDayView
        datasetId={datasetId}
        doc={doc}
        initialDay={{ doc: first.doc, date: first.date }}
        entityTypes={entityTypes}
        focus={focus}
      />
    );

  return (
    <Box>
      {content}
      {rawTables.length > 0 ? (
        <>
          <Typography
            id={RAW_DIFF_ID}
            variant='h6'
            fontWeight={700}
            sx={{ mb: 2, scrollMarginTop: 96 }}
          >
            Raw file diff
          </Typography>
          <RawTablesSection
            datasetId={datasetId}
            tables={rawTables}
            note={
              tripMatching ? (
                <>
                  Trips are joined by what they are, not by trip_id:{' '}
                  {tripMatching.mapped.toLocaleString()} of{' '}
                  {tripMatching.base_trips.toLocaleString()} base trips were
                  matched to a new trip ({tripMatching.renamed.toLocaleString()}{' '}
                  renumbered). Rows whose only differences are identifiers
                  (trip_id, block_id, service_id, stop_sequence, or a shape_id
                  whose shape is identical) are “ID only”, not changes.
                </>
              ) : undefined
            }
          />
        </>
      ) : null}
    </Box>
  );
}

/**
 * A typical weekday both feeds run; when they share no dates, the typical
 * weekday of each period ("<base>~<new>").
 */
function defaultDate(doc: TripsDiffDoc): AnchorKey {
  return (
    doc.day_types.find((d) => d.primary)?.date ??
    periodDayTypes(doc)[0]?.key ??
    dateBounds(doc).min ??
    ''
  );
}

function TripsDayView({
  datasetId,
  doc,
  initialDay,
  entityTypes,
  focus,
}: {
  datasetId: string;
  /** Index document: for a sharded dataset its trip lists are empty. */
  doc: TripsIndexDoc;
  /** Trips of the default date, already loaded by the panel. */
  initialDay: { doc: TripsDiffDoc; date: GtfsDate };
  entityTypes: EntityTypeDiff[];
  focus: NavFocus | null;
}): React.ReactElement {
  const nav = useDiffNav();
  const [date, setDate] = useState<GtfsDate>(() => defaultDate(doc));
  const [minor, setMinor] = useState(DEFAULT_MINOR_THRESHOLD_S);
  const [mode, setMode] = useState<Mode>('routes');
  const [verdicts, setVerdicts] = useState<RouteVerdict[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<TripPair | null>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  // Huge feeds: the day's routes come from the index, and only the picked
  // route's trips are loaded and diffed.
  const byRoute = isByRoute(doc);
  const [routeId, setRouteId] = useState<string | null>(null);

  const bounds = useMemo(() => dateBounds(doc), [doc]);
  const coverage = useMemo(() => feedCoverage(doc), [doc]);
  const periodTypes = useMemo(() => periodDayTypes(doc), [doc]);
  const crossPeriod = isCrossPeriod(date);
  // The diff shown is for the last day whose trips finished loading.
  const loaded = useTripsDay(datasetId, doc, date, initialDay, routeId);
  const dayDoc = loaded.doc ?? initialDay.doc;
  const dayDate = loaded.date ?? initialDay.date;
  const day = useMemo(
    () => computeDayDiff(dayDoc, dayDate, minor),
    [dayDoc, dayDate, minor],
  );

  const changed = useMemo(
    () => day.routes.filter((r) => isChanged(r) || r.minor_only),
    [day],
  );
  const unchanged = useMemo(
    () => day.routes.filter((r) => !isChanged(r) && !r.minor_only),
    [day],
  );
  const verdictCounts = useMemo(() => {
    const c = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<
      RouteVerdict,
      number
    >;
    for (const r of day.routes) for (const v of r.verdicts) c[v]++;
    return c;
  }, [day]);
  const filtered =
    verdicts.length === 0
      ? changed
      : changed.filter((r) => r.verdicts.some((v) => verdicts.includes(v)));
  const routeCounts = useMemo(
    () => (byRoute ? routeDayCounts(doc, servicesForDate(doc, date)) : []),
    [byRoute, doc, date],
  );
  // Whole-day trip counts: from the index when only one route is loaded.
  const dayTrips = byRoute
    ? routeCounts.reduce(
        (t, c) => ({ base: t.base + c.base, new: t.new + c.new }),
        { base: 0, new: 0 },
      )
    : day.trips;
  const dayServices = byRoute
    ? servicesForDate(doc, date)
    : { base: day.services.base, new: day.services.new };
  const selected =
    day.routes.find((r) => r.key === selectedKey) ??
    // By route: the loaded route's first changed direction.
    (byRoute && loaded.route === routeId
      ? (day.routes.find(isChanged) ?? day.routes[0] ?? null)
      : null);

  const scrollToRoute = (): void => {
    requestAnimationFrame(() =>
      routeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const selectRoute = (key: string | null): void => {
    setSelectedKey(key);
    const r = day.routes.find((x) => x.key === key);
    nav?.replaceTarget(
      r ? { tab: 'trips', kind: 'route', id: r.route } : { tab: 'trips' },
    );
    if (r) scrollToRoute();
  };

  const selectStop = (id: string | null): void => {
    setStopId(id);
    nav?.replaceTarget(
      id ? { tab: 'trips', kind: 'stop', id } : { tab: 'trips' },
    );
  };

  const pickRoute = (id: string): void => {
    setRouteId(id);
    setSelectedKey(null);
    nav?.replaceTarget({ tab: 'trips', kind: 'route', id });
    scrollToRoute();
  };

  // Cross-tab focus and deep links: #trips/route/<route_id>, #trips/stop/<id>.
  useEffect(() => {
    if (focus?.id == null) return;
    if (byRoute) {
      // No stop board without the whole day.
      if (focus.kind !== 'route') return;
      setMode('routes');
      pickRoute(focus.id);
      return;
    }
    if (focus.kind === 'stop') {
      setMode('stop');
      setStopId(focus.id);
      return;
    }
    if (focus.kind !== 'route') return;
    const candidates = day.routes.filter((r) => r.route === focus.id);
    const r = candidates.find(isChanged) ?? candidates[0];
    if (!r) return;
    setMode('routes');
    setVerdicts([]);
    setSelectedKey(r.key);
    scrollToRoute();
  }, [focus?.nonce]);

  const classSummary = TRIP_CLASSES.filter((c) => day.class_counts[c] > 0).map(
    (c) => `${day.class_counts[c]} ${TRIP_CLASS_LABELS[c].toLowerCase()}`,
  );

  return (
    <Box>
      <Box sx={cardSx}>
        <DayPicker
          dayTypes={doc.day_types}
          periodTypes={periodTypes}
          value={date}
          bounds={bounds}
          coverage={coverage}
          onChange={setDate}
        />
        {loaded.loading ? (
          <Box sx={{ mt: 1.5 }}>
            <LinearProgress />
            <Typography variant='caption' color='text.secondary'>
              Loading trips for this day… still showing the previous day.
            </Typography>
          </Box>
        ) : loaded.error != null ? (
          <Alert severity='error' sx={{ mt: 1.5 }}>
            Could not load this day&apos;s trips: {loaded.error.message}
          </Alert>
        ) : null}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            mt: 2,
          }}
        >
          <Typography variant='body2'>
            <b>
              <CountChange base={dayTrips.base} next={dayTrips.new} />
            </b>{' '}
            trips · {dayServices.base.length} → {dayServices.new.length}{' '}
            services running
          </Typography>
          <Box sx={{ flex: 1 }} />
          <TextField
            select
            size='small'
            label='Minor threshold'
            value={minor}
            onChange={(e) => setMinor(Number(e.target.value))}
            sx={{ width: 150 }}
            helperText='Time changes at or below are dimmed'
          >
            {MINOR_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {s === 0 ? 'Off' : s < 60 ? `≤ ${s} s` : `≤ ${s / 60} min`}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Typography variant='caption' color='text.secondary' component='div'>
          {byRoute && classSummary.length > 0 && routeId != null
            ? `Route ${doc.routes[routeId]?.short_name || routeId}: `
            : ''}
          {classSummary.join(' · ')}
          {day.minor_count > 0 &&
            ` · ${day.minor_count} minor time change${day.minor_count === 1 ? '' : 's'} (dimmed, not counted)`}
        </Typography>
        {dayTrips.base + dayTrips.new === 0 && (
          <Alert severity='info' sx={{ mt: 1.5 }}>
            Neither feed runs any trip on{' '}
            {crossPeriod ? 'these days' : 'this day'}.
          </Alert>
        )}
        {dayTrips.base === 0 && dayTrips.new > 0 && (
          <Alert severity='info' sx={{ mt: 1.5 }}>
            The base feed has no service on{' '}
            {crossPeriod ? 'the base date' : 'this day'}, so every trip shows as
            added. Pick a{crossPeriod ? ' base' : ''} date it covers (
            {formatGtfsDate(coverage.base.min)} –{' '}
            {formatGtfsDate(coverage.base.max)}) to compare timetables.
          </Alert>
        )}
        {dayTrips.new === 0 && dayTrips.base > 0 && (
          <Alert severity='warning' sx={{ mt: 1.5 }}>
            The new feed has no service on{' '}
            {crossPeriod ? 'the new date' : 'this day'}, so every trip shows as
            removed. It covers {formatGtfsDate(coverage.new.min)} –{' '}
            {formatGtfsDate(coverage.new.max)}.
          </Alert>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <ToggleButtonGroup
          size='small'
          exclusive
          value={mode}
          onChange={(_, v: Mode | null) => v && setMode(v)}
        >
          <ToggleButton value='routes' sx={{ textTransform: 'none' }}>
            By route
          </ToggleButton>
          <ToggleButton
            value='stop'
            disabled={byRoute}
            sx={{ textTransform: 'none' }}
          >
            Stop departure board
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant='caption' color='text.secondary'>
          {mode === 'routes'
            ? 'Route → pattern → trip. Trips are matched by pattern and departure time, never by trip_id.'
            : 'What changes at one stop on this day.'}
          {byRoute &&
            ' The stop departure board needs a whole day of trips, too large for this dataset.'}
        </Typography>
      </Box>

      {mode === 'routes' && byRoute ? (
        <>
          <Box sx={cardSx}>
            <RouteDayList
              counts={routeCounts}
              routes={doc.routes}
              selected={routeId}
              onSelect={pickRoute}
            />
            {routeId != null && loaded.route === routeId && (
              <Box sx={{ mt: 2 }}>
                <RouteOverviewTable
                  changed={changed}
                  unchanged={unchanged}
                  routes={doc.routes}
                  selectedKey={selected?.key ?? null}
                  onSelect={(k) => setSelectedKey(k)}
                />
              </Box>
            )}
          </Box>
          <Box ref={routeRef} sx={{ scrollMarginTop: 96 }}>
            {selected ? (
              <RouteView
                key={`${selected.key}-${date}`}
                route={selected}
                info={doc.routes[selected.route]}
                stopNames={doc.stops}
                onOpenTrip={setDrawer}
                onClose={() => {
                  setRouteId(null);
                  setSelectedKey(null);
                  nav?.replaceTarget({ tab: 'trips' });
                }}
              />
            ) : (
              <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
                {routeId == null
                  ? 'Pick a route to compare its timetable on this day.'
                  : loaded.route === routeId && !loaded.loading
                    ? 'This route runs no trip on this day in either feed.'
                    : 'Loading the route…'}
              </Typography>
            )}
          </Box>
        </>
      ) : mode === 'routes' ? (
        <>
          <Box sx={cardSx}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {VERDICTS.map((v) => {
                const active = verdicts.includes(v);
                const color = VERDICT_COLORS[v];
                return (
                  <Chip
                    key={v}
                    label={`${VERDICT_LABELS[v]} · ${verdictCounts[v]}`}
                    disabled={verdictCounts[v] === 0 && !active}
                    onClick={() =>
                      setVerdicts((s) =>
                        s.includes(v) ? s.filter((x) => x !== v) : [...s, v],
                      )
                    }
                    sx={{
                      bgcolor: active ? color : 'transparent',
                      color: active ? '#fff' : color,
                      border: `1px solid ${color}`,
                      fontWeight: 700,
                      '&:hover': {
                        bgcolor: active ? color : 'transparent',
                        opacity: 0.85,
                      },
                    }}
                  />
                );
              })}
            </Box>
            <RouteOverviewTable
              changed={filtered}
              unchanged={verdicts.length === 0 ? unchanged : []}
              routes={doc.routes}
              selectedKey={selectedKey}
              onSelect={(k) => selectRoute(k === selectedKey ? null : k)}
            />
          </Box>
          <Box ref={routeRef} sx={{ scrollMarginTop: 96 }}>
            {selected ? (
              <RouteView
                key={`${selected.key}-${date}`}
                route={selected}
                info={doc.routes[selected.route]}
                stopNames={doc.stops}
                onOpenTrip={setDrawer}
                onClose={() => selectRoute(null)}
              />
            ) : (
              <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
                Select a route to see its service profile, stop patterns and
                timetable for this day.
              </Typography>
            )}
          </Box>
        </>
      ) : (
        <Box sx={cardSx}>
          <StopBoard
            day={day}
            stopId={stopId}
            onStopChange={selectStop}
            stopNames={doc.stops}
            routes={doc.routes}
            minorThreshold={minor}
            onOpenTrip={setDrawer}
          />
        </Box>
      )}

      <TechnicalDrilldown
        day={day}
        routes={doc.routes}
        entityTypes={entityTypes}
        onOpenTrip={setDrawer}
      />

      <TripDrawer
        pair={drawer}
        route={drawer ? doc.routes[drawer.route] : undefined}
        stopNames={doc.stops}
        onClose={() => setDrawer(null)}
      />
    </Box>
  );
}
