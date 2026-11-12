'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowBack, Close, Edit, SwapHoriz } from '@mui/icons-material';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useRouter } from '../../../../../i18n/navigation';
import type { GtfsDate, GtfsEntityDiff } from '../../lib/entity-diff-types';
import type { DiffDataset } from '../../lib/datasets';
import type { ReportSummary } from '../../lib/report';
import type {
  DayDiff,
  RouteDirDiff,
  TripPair,
  TripsDiffDoc,
} from '../../lib/trips-types';
import {
  type TripsIndexDoc,
  isByRoute,
  routeDayCounts,
} from '../../lib/trips-shards';
import {
  type AnchorKey,
  feedCoverage,
  periodDayTypes,
} from '../../lib/trips-anchor';
import {
  computeDayDiff,
  dateBounds,
  servicesForDate,
} from '../../lib/trips-utils';
import {
  type DaySummary,
  dayChips,
  daySummary,
  routeHasRiderChanges,
} from '../../lib/trips-v2-summary';
import {
  type DayCatalog,
  dayCatalog,
  describeDay,
} from '../../lib/trips-v2-days';
import { useDiffData } from '../../lib/useDiffData';
import { useTripsDay } from '../../lib/useTripsDay';
import {
  type RouteRowFilters,
  defaultDirection,
  parseRouteFilters,
  scopeDayToRoute,
  type TripsView,
  tripsListHref,
  tripsRouteHref,
  writeRouteFilters,
} from '../../lib/trips-v2-routes';
import ReportLayout, {
  ReportActions,
  ReportHeaderSlot,
} from '../report/ReportLayout';
import NotableHighlights from '../overview/NotableHighlights';
import { HighlightDetails } from '../highlights/HighlightRow';
import type { GlobalHighlight } from '../../lib/global-highlights';
import type { TripsCalendarDoc } from '../../lib/trips-calendar';
import { periodByDate, servicePeriods } from '../../lib/trips-periods';
import { dayKindLabel } from '../../lib/trips-v5-day-kinds';
import { routeHighlights } from '../../lib/trips-v5-route-highlights';
import { routeChangeChips } from '../../lib/trips-v5-route-summary';
import { categoryColor } from '../trips-v5/MainChangeChips';
import { ADDED, CHANGED, REMOVED } from './shared';
import type { ChipTone } from '../../lib/trips-v2-summary';
import { dayRouteRows } from '../../lib/trips-v5-day-filter';
import {
  MAIN_CHANGE_LABELS,
  type MainChangeCategory,
  routeChips,
} from '../../lib/trips-v2-summary';
import TransitLoader from '../TransitLoader';
import TripDrawer from '../trips/TripDrawer';
import { TripRouteChip } from '../trips/shared';
import { formatGtfsDateLong } from '../../lib/calendar-utils';
import DayPickerCard from './DayPickerCard';
import DayScope from './DayScope';
import OverviewCard from './OverviewCard';
import RawDiffSection from './RawDiffSection';
import RouteChangesTable from './RouteChangesTable';
import RouteDayCountsCard from './RouteDayCountsCard';
import RouteDetailCard from './RouteDetailCard';
import TechnicalDrilldownCard from './TechnicalDrilldownCard';
import DrilldownButton from '../trips-v3/DrilldownButton';
import { ChipRow, V2Card } from './shared';

/** Text and border colour of a count chip by its tone. */
const TONE_COLORS: Record<ChipTone, string> = {
  neutral: 'text.primary',
  added: ADDED,
  removed: REMOVED,
  changed: CHANGED,
  quiet: 'text.secondary',
};

/** Trips v5 route page: the direction and date lines under the title. */
const SUBHEAD_SX = {
  m: 0,
  fontFamily: 'inherit',
  fontWeight: 'bold',
  fontSize: { xs: 15, sm: 18 },
  lineHeight: 1.5,
  letterSpacing: 'normal',
} as const;

/** Section id and slug of this page in the report header. */
export const TRIPS_V2_SECTION = 'trips_v2';
export const TRIPS_V2_SLUG = 'trips-v2';

interface TripsV2ScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
  /** Route page (/trips-v2/<route_id>); the route list when absent. */
  routeId?: string;
  /**
   * Which Trips view the page belongs to: links stay in it, and in v3 the
   * technical drill-down is a popup behind an info icon.
   */
  view?: TripsView;
  /** Trips v5 route page: the day's schedule group comes from it. */
  calendar?: TripsCalendarDoc | null;
  /** Trips v5 route page: the trips highlights; those naming the route show. */
  highlights?: GlobalHighlight[] | null;
}

/**
 * The first typical day both feeds run service on; when they share no
 * dates, a typical weekday of each feed ("<base>~<new>").
 */
function defaultDate(doc: TripsDiffDoc): AnchorKey {
  const both = (d: GtfsDate): boolean => {
    const [b, n] = doc.dates[d] ?? [-1, -1];
    return b >= 0 && n >= 0;
  };
  const primary = doc.day_types.filter((d) => d.primary);
  return (
    primary.find((d) => both(d.date))?.date ??
    doc.day_types.find((d) => both(d.date))?.date ??
    periodDayTypes(doc)[0]?.key ??
    primary[0]?.date ??
    dateBounds(doc).min ??
    ''
  );
}

/** The report with this page added, so the header titles it. */
function withTripsV2(report: ReportSummary): ReportSummary {
  const trips = report.sections.find((s) => s.id === 'trips');
  return {
    ...report,
    sections: [
      ...report.sections,
      {
        id: TRIPS_V2_SECTION,
        slug: TRIPS_V2_SLUG,
        label: 'Trips',
        count: trips?.count ?? null,
        counts: trips?.counts ?? null,
        files: trips?.files ?? ['trips.txt', 'stop_times.txt'],
        present: true,
      },
    ],
  };
}

/**
 * /gtfs-diff-tool-v2/<dataset>/trips-v2, top to bottom:
 *   1. what changed in the trip files across all dates (route list only);
 *   2. the day to compare: a typical day, a special day or any date;
 *   3. everything worked out for that day, in one titled section;
 *   4. the raw rows (DuckDB over Parquet), across all dates.
 * /trips-v2/<route_id> is the same for one route.
 */
export default function TripsV2Screen({
  dataset,
  report,
  routeId,
  view = 'trips-v2',
  calendar,
  highlights,
}: TripsV2ScreenProps): React.ReactElement {
  const header = useMemo(() => withTripsV2(report), [report]);
  const entity = useDiffData<GtfsEntityDiff>(dataset.id, 'entity');
  const trips = useDiffData<TripsIndexDoc>(dataset.id, 'trips');
  // Large feeds load per service: load the first day before showing it.
  const first = useTripsDay(
    dataset.id,
    trips.data,
    trips.data ? defaultDate(trips.data) : null,
    undefined,
    routeId ?? null,
  );
  // Feeds too large to diff a whole day load one route at a time.
  const byRoute = trips.data != null && isByRoute(trips.data);
  const routeInfo = routeId ? trips.data?.routes[routeId] : undefined;
  const routeLabel = routeId ? routeInfo?.short_name || routeId : null;
  // Trips v5: a lighter route page, titled after the route.
  const v5 = view === 'trips-v5';
  const routeName = routeInfo?.long_name
    ? `${routeLabel} · ${routeInfo.long_name}`
    : `Route ${routeLabel}`;
  const category = entity.data?.categories.find((c) => c.id === 'trips');
  const rawTables = category?.raw_tables ?? [];
  const hasRawStopTimes = rawTables.some((t) => t.file === 'stop_times.txt');
  const catalog = useMemo(
    () => (trips.data ? dayCatalog(trips.data) : null),
    [trips.data],
  );
  const coverage = useMemo(
    () => (trips.data ? feedCoverage(trips.data) : null),
    [trips.data],
  );

  let content: React.ReactElement;
  if (trips.error != null || first.error != null)
    content = (
      <Alert severity='error' sx={{ mb: 3 }}>
        Could not load the trips data (trips-diff.json). Build it with{' '}
        <code>node scripts/build-gtfs-diff-dataset.mjs {dataset.id}</code>.
      </Alert>
    );
  else if (
    trips.data == null ||
    catalog == null ||
    first.doc == null ||
    first.date == null
  )
    content = <TransitLoader label='Loading trips…' />;
  else
    content = (
      <TripsDay
        datasetId={dataset.id}
        doc={trips.data}
        catalog={catalog}
        initialDay={{ doc: first.doc, date: first.date }}
        rawDatasetId={hasRawStopTimes ? dataset.id : null}
        routeId={routeId ?? null}
        view={view}
        calendar={calendar ?? null}
        highlights={highlights ?? null}
      />
    );

  return (
    <ReportLayout
      dataset={dataset}
      report={header}
      section={TRIPS_V2_SECTION}
      subpage={
        routeId
          ? {
              label: routeLabel ?? routeId,
              title: v5 ? `Trips: ${routeId}` : routeName,
              href: tripsListHref(dataset.id, undefined, undefined, view),
            }
          : undefined
      }
      hideFeeds={v5}
    >
      {v5 ? null : (
        <ReportActions>
          <Button
            component={Link}
            href={`/gtfs-diff-tool-v2/${dataset.id}/trips`}
            variant='outlined'
            sx={{ flexShrink: 0, alignSelf: 'center' }}
          >
            Classic trips view
          </Button>
        </ReportActions>
      )}
      {/* After the trips index: it says whether the feed is too large to scan. */}
      {routeId == null && entity.data != null && trips.data != null ? (
        <OverviewCard
          datasetId={dataset.id}
          rawTables={rawTables}
          coverage={coverage}
          routes={trips.data.routes}
          wholeFeedQueries={!byRoute}
        />
      ) : null}
      {content}
      {entity.error != null ? (
        <Alert severity='warning'>
          Could not load the raw file diff: {entity.error.message}
        </Alert>
      ) : entity.data == null ? (
        <TransitLoader label='Loading the raw file diff…' />
      ) : (
        <RawDiffSection
          datasetId={dataset.id}
          rawTables={rawTables}
          tripMatching={category?.trip_matching}
          routeId={routeId ?? null}
          routeLabel={routeLabel}
        />
      )}
    </ReportLayout>
  );
}

function routeFromHash(): string | null {
  const m = /^#route\/(.+)$/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Update query parameters in place (no history entry), keeping the hash. */
function replaceQuery(update: (params: URLSearchParams) => void): void {
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  update(params);
  const qs = params.toString();
  window.history.replaceState(
    null,
    '',
    `${pathname}${qs ? `?${qs}` : ''}${hash}`,
  );
}

/** "Direction 0 · Vacarisses": a route direction's id and headsign. */
function directionName(r: RouteDirDiff): string {
  const id = `Direction ${r.dir === '' ? '(none)' : r.dir}`;
  return r.headsign ? `${id} · ${r.headsign}` : id;
}

/** A day key the document knows (typical day, period or service date). */
function isKnownDay(doc: TripsIndexDoc, key: string): boolean {
  return (
    doc.day_types.some((d) => d.date === key) ||
    periodDayTypes(doc).some((p) => p.key === key) ||
    doc.dates[key] != null
  );
}

/** Headline of the chosen day: the chips, and why the numbers may look off. */
function DayAtAGlance({
  day,
  summary,
  scope,
  subject,
}: {
  day: DayDiff;
  summary: DaySummary;
  scope: string;
  subject: string;
}): React.ReactElement {
  return (
    <V2Card title='At a glance' scope={scope} caption={subject}>
      {day.trips.base + day.trips.new === 0 ? (
        <Alert severity='info'>Neither feed runs any trip on this day.</Alert>
      ) : (
        <>
          <ChipRow chips={dayChips(summary)} />
          {day.trips.base === 0 ? (
            <Alert severity='info' sx={{ mt: 1.5 }}>
              The before feed has no service on this day, so every trip shows as
              added. Pick a day both feeds cover.
            </Alert>
          ) : day.trips.new === 0 ? (
            <Alert severity='warning' sx={{ mt: 1.5 }}>
              The after feed has no service on this day, so every trip shows as
              removed.
            </Alert>
          ) : null}
        </>
      )}
    </V2Card>
  );
}

function TripsDay({
  datasetId,
  doc,
  catalog,
  initialDay,
  rawDatasetId,
  routeId,
  view,
  calendar,
  highlights,
}: {
  datasetId: string;
  /** Index document: for a sharded dataset its trip lists are empty. */
  doc: TripsIndexDoc;
  catalog: DayCatalog;
  initialDay: { doc: TripsDiffDoc; date: AnchorKey };
  rawDatasetId: string | null;
  /** Route page when set, else the route list. */
  routeId: string | null;
  view: TripsView;
  calendar: TripsCalendarDoc | null;
  highlights: GlobalHighlight[] | null;
}): React.ReactElement {
  const router = useRouter();
  // Mounted after the trips data loaded (client only), so the query string
  // can seed the state: ?day=…&change=…&q=…&dir=…
  const [date, setDate] = useState<AnchorKey>(() => {
    const asked = new URLSearchParams(window.location.search).get('day');
    return asked && isKnownDay(doc, asked) ? asked : defaultDate(doc);
  });
  // Trips v5: the day sits beside the date, changed in a popup.
  const [picking, setPicking] = useState(false);
  const [dirMenu, setDirMenu] = useState<HTMLElement | null>(null);
  const [filters, setFilters] = useState<RouteRowFilters>(() =>
    parseRouteFilters(new URLSearchParams(window.location.search)),
  );
  const [dir, setDir] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('dir'),
  );
  const [drawer, setDrawer] = useState<TripPair | null>(null);

  const periodTypes = useMemo(() => periodDayTypes(doc), [doc]);
  const coverage = useMemo(() => feedCoverage(doc), [doc]);
  // The diff shown is for the last day whose trips finished loading.
  const byRoute = isByRoute(doc);
  const loaded = useTripsDay(datasetId, doc, date, initialDay, routeId);
  const dayDoc = loaded.doc ?? initialDay.doc;
  const dayDate = loaded.date ?? initialDay.date;
  const fullDay = useMemo(
    () => computeDayDiff(dayDoc, dayDate),
    [dayDoc, dayDate],
  );
  // On a route page, the day's summary covers that route only.
  const routeDay = useMemo(
    () => (routeId ? scopeDayToRoute(fullDay, routeId) : fullDay),
    [fullDay, routeId],
  );
  const directions = useMemo(
    () => [...routeDay.routes].sort((a, b) => a.dir.localeCompare(b.dir)),
    [routeDay],
  );
  const current = useMemo(
    () => defaultDirection(directions, dir),
    [directions, dir],
  );
  // Trips v5: a route page covers its direction only, every figure included.
  const scopedDir =
    view === 'trips-v5' && routeId != null ? (current?.dir ?? null) : null;
  const oneDirection = scopedDir != null && current != null;
  const day = useMemo(
    () =>
      routeId && scopedDir != null
        ? scopeDayToRoute(fullDay, routeId, scopedDir)
        : routeDay,
    [fullDay, routeId, scopedDir, routeDay],
  );
  const summary = useMemo(() => daySummary(day), [day]);
  const changed = useMemo(() => day.routes.filter(routeHasRiderChanges), [day]);
  const quiet = useMemo(
    () => day.routes.filter((r) => !routeHasRiderChanges(r)),
    [day],
  );
  const allPairs = useMemo(() => day.routes.flatMap((r) => r.pairs), [day]);
  // Named after the day shown, which lags the picked one while loading.
  const described = useMemo(
    () => describeDay(dayDate, doc, catalog, periodTypes),
    [dayDate, doc, catalog, periodTypes],
  );
  // Trips v5 route page: the day under the title, then chips: its schedule
  // group, the route's change categories and its day totals.
  const v5Route = view === 'trips-v5' && routeId != null;
  // A "<base>~<new>" key (feeds sharing no dates) is titled by its new date.
  const shownDate = date.includes('~') ? date.split('~')[1] : date;
  const dayTitle = /^\d{8}$/.test(shownDate)
    ? formatGtfsDateLong(shownDate)
    : described.title;
  const periods = useMemo(
    () => (v5Route && calendar ? periodByDate(servicePeriods(calendar)) : {}),
    [v5Route, calendar],
  );
  const period = periods[shownDate];
  const scheduleGroup = period
    ? dayKindLabel(period)
    : described.title.split(' · ')[0];
  const related = useMemo(
    () =>
      v5Route && highlights && routeId
        ? routeHighlights(highlights, routeId)
        : [],
    [v5Route, highlights, routeId],
  );
  const routeCategories = useMemo((): MainChangeCategory[] => {
    if (!v5Route) return [];
    const found = new Set(
      dayRouteRows(day.routes, doc.routes, doc.stops).flatMap(
        (row) => row.categories,
      ),
    );
    return (Object.keys(MAIN_CHANGE_LABELS) as MainChangeCategory[]).filter(
      (c) => found.has(c),
    );
  }, [v5Route, day, doc]);
  const changeChips = useMemo(
    () => routeChangeChips(summary, routeCategories),
    [summary, routeCategories],
  );

  // Mirror the day and filters in the URL so back/forward restore them.
  useEffect(() => replaceQuery((p) => p.set('day', date)), [date]);
  useEffect(() => {
    if (!routeId) replaceQuery((p) => writeRouteFilters(p, filters));
  }, [filters, routeId]);

  // Links from before routes had their own page: #route/<route_id>.
  useEffect(() => {
    const legacy = routeId ? null : routeFromHash();
    if (legacy)
      router.replace(tripsRouteHref(datasetId, legacy, { day: date, view }));
  }, []);

  const openRoute = (r: RouteDirDiff): void =>
    router.push(
      tripsRouteHref(datasetId, r.route, {
        day: date,
        dir: r.dir,
        filters,
        view,
      }),
    );

  const picker = (
    <DayPickerCard
      dayTypes={doc.day_types}
      periodTypes={periodTypes}
      catalog={catalog}
      coverage={coverage}
      value={date}
      onChange={setDate}
    />
  );
  const drawerEl = (
    <TripDrawer
      pair={drawer}
      route={drawer ? doc.routes[drawer.route] : undefined}
      stopNames={doc.stops}
      onClose={() => setDrawer(null)}
      detailed={view === 'trips-v5' ? { rawDatasetId } : undefined}
    />
  );

  // Too large to diff a whole day: each route's trip count, from the index.
  if (routeId == null && byRoute) {
    return (
      <Box>
        {picker}
        <DayScope day={described} loading={loaded.loading} error={loaded.error}>
          <RouteDayCountsCard
            rows={routeDayCounts(doc, servicesForDate(doc, dayDate))}
            routes={doc.routes}
            scope={described.short}
            onOpen={(route) =>
              router.push(tripsRouteHref(datasetId, route, { day: date, view }))
            }
          />
        </DayScope>
      </Box>
    );
  }

  if (routeId == null) {
    return (
      <Box>
        {picker}
        <DayScope day={described} loading={loaded.loading} error={loaded.error}>
          <DayAtAGlance
            day={day}
            summary={summary}
            scope={described.short}
            subject='Every route running this day.'
          />
          {fullDay.routes.length > 0 ? (
            <RouteChangesTable
              changed={changed}
              quiet={quiet}
              routes={doc.routes}
              stopNames={doc.stops}
              filters={filters}
              onFiltersChange={setFilters}
              onOpen={openRoute}
              scope={described.short}
            />
          ) : null}
          <TechnicalDrilldownCard
            pairs={allPairs}
            scope={described.short}
            subject='Every route running this day.'
          />
        </DayScope>
        {drawerEl}
      </Box>
    );
  }

  const info = doc.routes[routeId];
  const label = info?.short_name || routeId;
  const selectDir = (d: string): void => {
    setDir(d);
    // Trips v5: each direction is a page of its own.
    if (view === 'trips-v5')
      router.push(
        tripsRouteHref(datasetId, routeId, { day: date, dir: d, view }),
      );
    else replaceQuery((p) => p.set('dir', d));
  };
  const scopeLabel = oneDirection
    ? `Route ${label}, ${current.headsign || `direction ${current.dir || '(none)'}`}`
    : `Route ${label}, every direction`;

  const drilldown =
    view === 'trips-v2' ? null : (
      <DrilldownButton
        pairs={allPairs}
        scope={described.short}
        subject={scopeLabel}
      />
    );
  const v5 = view === 'trips-v5';
  const daySubheader = v5;
  const v5Chips = (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
    >
      <Tooltip title={described.note} placement='bottom-start'>
        <Chip
          variant='outlined'
          label={scheduleGroup}
          sx={{ fontWeight: 600, cursor: 'help' }}
        />
      </Tooltip>
      {current ? (
        <Chip
          variant='outlined'
          label={routeChips(current)[0].label}
          sx={{ fontWeight: 600 }}
        />
      ) : null}
      {changeChips.counts.map((c) => (
        <Chip
          key={c.label}
          variant='outlined'
          label={c.label}
          sx={{
            fontWeight: 600,
            color: TONE_COLORS[c.tone],
            borderColor: TONE_COLORS[c.tone],
          }}
        />
      ))}
      {changeChips.categories.map((c) => (
        <Chip
          key={c}
          variant='outlined'
          label={MAIN_CHANGE_LABELS[c]}
          sx={{
            fontWeight: 600,
            color: categoryColor(c),
            borderColor: categoryColor(c),
          }}
        />
      ))}
    </Box>
  );

  return (
    <Box>
      {v5 ? (
        <ReportHeaderSlot>
          {current ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                columnGap: 1.5,
                flexWrap: 'wrap',
              }}
            >
              <Typography component='p' color='text.secondary' sx={SUBHEAD_SX}>
                {directionName(current)}
              </Typography>
              {directions.length > 1 ? (
                <>
                  <Button
                    size='small'
                    startIcon={<SwapHoriz fontSize='small' />}
                    onClick={(e) => setDirMenu(e.currentTarget)}
                    aria-haspopup='menu'
                    aria-expanded={dirMenu != null}
                    sx={{ textTransform: 'none' }}
                  >
                    Change direction
                  </Button>
                  <Menu
                    anchorEl={dirMenu}
                    open={dirMenu != null}
                    onClose={() => setDirMenu(null)}
                  >
                    {directions.map((r) => (
                      <MenuItem
                        key={r.key}
                        selected={r.dir === current.dir}
                        onClick={() => {
                          setDirMenu(null);
                          if (r.dir !== current.dir) selectDir(r.dir);
                        }}
                      >
                        <ListItemText
                          primary={directionName(r)}
                          secondary={
                            r.trips.base === r.trips.new
                              ? `${r.trips.new} trips`
                              : `${r.trips.base} → ${r.trips.new} trips`
                          }
                        />
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              ) : null}
            </Box>
          ) : null}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              columnGap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <Typography component='h2' color='text.secondary' sx={SUBHEAD_SX}>
              {dayTitle}
            </Typography>
            {daySubheader ? (
              <Button
                size='small'
                startIcon={<Edit fontSize='small' />}
                onClick={() => setPicking(true)}
                sx={{ textTransform: 'none' }}
              >
                Change date
              </Button>
            ) : null}
            <Box sx={{ flex: 1 }} />
            {drilldown}
          </Box>
        </ReportHeaderSlot>
      ) : (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            component={Link}
            href={tripsListHref(datasetId, date, filters, view)}
            startIcon={<ArrowBack />}
            size='small'
          >
            All routes
          </Button>
          <Box sx={{ flex: 1 }} />
          {drilldown}
        </Box>
      )}
      {daySubheader ? (
        <Dialog
          open={picking}
          onClose={() => setPicking(false)}
          maxWidth='lg'
          fullWidth
        >
          <DialogTitle
            sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}
          >
            <Box sx={{ flex: 1 }}>Change date</Box>
            <IconButton
              size='small'
              onClick={() => setPicking(false)}
              aria-label='Close'
            >
              <Close />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <DayPickerCard
              dayTypes={doc.day_types}
              periodTypes={periodTypes}
              catalog={catalog}
              coverage={coverage}
              value={date}
              onChange={(d) => {
                setDate(d);
                setPicking(false);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : (
        picker
      )}
      <DayScope
        day={described}
        loading={loaded.loading}
        error={loaded.error}
        onChangeDay={daySubheader ? () => setPicking(true) : undefined}
        plain={v5}
      >
        {v5 ? (
          related.length > 0 ? (
            <V2Card title='Notable highlights'>
              <NotableHighlights
                heading={false}
                highlights={related}
                emptyText='Nothing to flag.'
                renderDetails={(h) =>
                  h.entities ? (
                    <HighlightDetails
                      highlight={h}
                      datasetId={datasetId}
                      sectionLabel='Trips'
                    />
                  ) : null
                }
              />
            </V2Card>
          ) : null
        ) : (
          <DayAtAGlance
            day={day}
            summary={summary}
            scope={described.short}
            subject={`${scopeLabel}.`}
          />
        )}
        {current == null ? (
          <Alert severity='info' sx={{ mb: 3 }}>
            Route {label} has no trips on this day in either feed. Pick another
            day above.
          </Alert>
        ) : (
          <>
            {directions.length > 1 && !v5 ? (
              <Tabs
                value={current.dir}
                onChange={(_, v: string) => selectDir(v)}
                variant='scrollable'
                scrollButtons='auto'
                sx={{ mb: 2 }}
              >
                {directions.map((r) => (
                  <Tab
                    key={r.key}
                    value={r.dir}
                    sx={{ textTransform: 'none', alignItems: 'flex-start' }}
                    label={
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <TripRouteChip routeId={r.route} route={info} />
                        <Box sx={{ textAlign: 'left' }}>
                          <Typography variant='body2' fontWeight={700}>
                            {r.headsign || `Direction ${r.dir || '(none)'}`}
                          </Typography>
                          <Typography variant='caption' color='text.secondary'>
                            {r.trips.base === r.trips.new
                              ? `${r.trips.new} trips`
                              : `${r.trips.base} → ${r.trips.new} trips`}
                            {routeHasRiderChanges(r) ? '' : ' · no changes'}
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                ))}
              </Tabs>
            ) : null}
            <RouteDetailCard
              key={`${current.key}-${dayDate}`}
              route={current}
              info={info}
              stopNames={doc.stops}
              dayLabel={described.short}
              onOpenTrip={setDrawer}
              onClose={
                v5
                  ? undefined
                  : () =>
                      router.push(tripsListHref(datasetId, date, filters, view))
              }
              rawDatasetId={rawDatasetId}
              title={v5 ? 'Service' : undefined}
              chips={v5 ? v5Chips : undefined}
              compact={v5}
            />
          </>
        )}
        {view !== 'trips-v2' ? null : (
          <TechnicalDrilldownCard
            pairs={allPairs}
            scope={described.short}
            subject={`${scopeLabel}.`}
          />
        )}
      </DayScope>
      {drawerEl}
    </Box>
  );
}
