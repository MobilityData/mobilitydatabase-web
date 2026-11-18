'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { CalendarMonth } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import useSWRImmutable from 'swr/immutable';
import { Link, useRouter } from '../../../../../i18n/navigation';
import type {
  GtfsDate,
  GtfsEntityDiff,
  RawTable,
  RouteInfo,
  ServiceDiff,
} from '../../lib/entity-diff-types';
import type { DiffDataset } from '../../lib/datasets';
import type { ReportSummary } from '../../lib/report';
import type { GlobalHighlight } from '../../lib/global-highlights';
import { SERVICES_PAGE } from '../../lib/sections';
import { useCategoryDetail, useDiffData } from '../../lib/useDiffData';
import {
  calendarKey,
  calendarUrls,
  loadServiceDiff,
} from '../../lib/useCalendarTables';
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  exceptionLabel,
  formatGtfsDate,
  monthGrid,
  serviceListPattern,
  weekdayFlags,
} from '../../lib/calendar-utils';
import {
  type ServiceDay,
  type ServiceDayState,
  calendarPageHref,
  monthsBetween,
  periodText,
  serviceDays,
  serviceRoutes,
} from '../../lib/service-detail';
import { DEFAULT_TRIPS_VIEW, tripsRouteHref } from '../../lib/trips-v2-routes';
import ReportLayout, { ReportHeaderSlot } from '../report/ReportLayout';
import NotableHighlights from '../overview/NotableHighlights';
import { HighlightDetails } from '../highlights/HighlightRow';
import RawTablesSection from '../raw/RawTablesSection';
import TransitLoader from '../TransitLoader';
import { ALL_DATES, V2Card } from '../trips-v2/shared';
import { useCalendarPalette } from '../trips-v5/palette';
import { MONO_FONT, RouteChip, STATUS_LABELS, statusColor } from './shared';

/** The subtitle line under the title, as on the Trips route page. */
const SUBHEAD_SX = {
  m: 0,
  fontFamily: 'inherit',
  fontWeight: 'bold',
  fontSize: { xs: 15, sm: 18 },
  lineHeight: 1.5,
  letterSpacing: 'normal',
} as const;

const headSx = {
  fontWeight: 700,
  fontSize: '0.75rem',
  whiteSpace: 'nowrap',
  color: 'text.secondary',
} as const;
const monoCellSx = { fontFamily: MONO_FONT, fontSize: '0.75rem', py: 0.5 };

/** The calendar raw tables, the only raw files about a service. */
const SERVICE_FILES = new Set(['calendar.txt', 'calendar_dates.txt']);

interface ServiceDetailScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
  serviceId: string;
  /** The services section's highlights; null when not built. */
  highlights: GlobalHighlight[] | null;
}

/** The highlights listing this service. */
function serviceHighlights(
  highlights: GlobalHighlight[],
  serviceId: string,
): GlobalHighlight[] {
  return highlights.filter(
    (h) =>
      h.entities?.kind === 'list' &&
      h.entities.of === 'service' &&
      h.entities.rows.some((r) => (r.openId ?? r.id) === serviceId),
  );
}

/**
 * /gtfs-diff-tool-v2/<dataset>/calendar/<service_id>: one service, laid out
 * like the Trips route page. Its status and figures under the title, then
 * the highlights naming it, the dates it runs in each feed, its schedule
 * (weekly pattern, calendar.txt and calendar_dates.txt changes), the routes
 * using it and its raw rows.
 */
export default function ServiceDetailScreen({
  dataset,
  report,
  serviceId,
  highlights,
}: ServiceDetailScreenProps): React.ReactElement {
  const entity = useDiffData<GtfsEntityDiff>(dataset.id, 'entity');
  const summary = entity.data?.categories.find((c) => c.id === SERVICES_PAGE);
  const detail = useCategoryDetail(dataset.id, summary);
  const calendar = detail.data?.calendar;
  const urls = calendar ? calendarUrls(dataset.id, calendar) : null;
  const service = useSWRImmutable<ServiceDiff | null, Error>(
    urls ? ['calendar service', calendarKey(urls), serviceId] : null,
    () => (urls ? loadServiceDiff(urls, serviceId) : null),
  );

  const error = entity.error ?? detail.error ?? service.error;
  let content: React.ReactElement;
  if (error != null)
    content = (
      <Alert severity='error'>
        Could not load the service: {error.message}
      </Alert>
    );
  else if (calendar != null && urls == null)
    content = (
      <Alert severity='warning'>
        This diff was built with an older calendar layout. Rebuild it to see its
        services (node scripts/build-gtfs-diff-dataset.mjs &lt;dataset&gt;
        --only entity,report).
      </Alert>
    );
  else if (entity.data != null && summary == null)
    content = (
      <Alert severity='warning'>{dataset.label} has no service calendar.</Alert>
    );
  else if (calendar == null || service.data === undefined)
    content = <TransitLoader label='Loading the service…' />;
  else if (service.data == null)
    content = (
      <Alert severity='warning'>
        No service <code>{serviceId}</code> in either feed.{' '}
        <Link href={calendarPageHref(dataset.id)}>Back to every service</Link>
      </Alert>
    );
  else
    content = (
      <ServiceDetail
        datasetId={dataset.id}
        service={service.data}
        routes={calendar.routes}
        rawTables={(detail.data?.raw_tables ?? []).filter((t) =>
          SERVICE_FILES.has(t.file),
        )}
        highlights={highlights}
        tripsPages={dataset.files.trips && dataset.files.entity}
      />
    );

  return (
    <ReportLayout
      dataset={dataset}
      report={report}
      section={SERVICES_PAGE}
      subpage={{
        label: serviceId,
        title: `Service: ${serviceId}`,
        href: calendarPageHref(dataset.id),
      }}
      hideFeeds
    >
      {content}
    </ReportLayout>
  );
}

function ServiceDetail({
  datasetId,
  service: s,
  routes,
  rawTables,
  highlights,
  tripsPages,
}: {
  datasetId: string;
  service: ServiceDiff;
  routes: Record<string, RouteInfo>;
  rawTables: RawTable[];
  highlights: GlobalHighlight[] | null;
  /** Whether the Trips route pages exist for the dataset. */
  tripsPages: boolean;
}): React.ReactElement {
  const related = useMemo(
    () => (highlights ? serviceHighlights(highlights, s.service_id) : []),
    [highlights, s.service_id],
  );
  return (
    <Box>
      <ServiceHeader datasetId={datasetId} service={s} />
      {related.length > 0 ? (
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
                  sectionLabel='Service Dates'
                />
              ) : null
            }
          />
        </V2Card>
      ) : null}
      <V2Card
        title='Service dates'
        scope={ALL_DATES}
        caption='Every date the service runs in either feed. A changed date opens that day on the Service Dates calendar.'
      >
        <ServiceDatesCalendar datasetId={datasetId} service={s} />
      </V2Card>
      <V2Card title='Schedule' scope={ALL_DATES}>
        <ScheduleDetails datasetId={datasetId} service={s} />
      </V2Card>
      <V2Card
        title='Routes'
        scope={ALL_DATES}
        caption={
          tripsPages
            ? 'Routes whose trips run on this service. A route opens its trips.'
            : 'Routes whose trips run on this service.'
        }
      >
        <ServiceRoutesTable
          datasetId={datasetId}
          service={s}
          routes={routes}
          linked={tripsPages}
        />
      </V2Card>
      <ServiceRawDiff
        datasetId={datasetId}
        serviceId={s.service_id}
        rawTables={rawTables}
      />
    </Box>
  );
}

// ── Header ─────────────────────────────────────────────────────────

function countLabel(
  s: ServiceDiff,
  base: number,
  next: number,
  noun: string,
): string {
  const plural = (n: number): string =>
    `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`;
  if (s.status === 'added') return plural(next);
  if (s.status === 'deleted') return plural(base);
  return base === next
    ? plural(next)
    : `${base.toLocaleString()} → ${plural(next)}`;
}

/** Under the title: the weekly pattern, then chips of what changed. */
function ServiceHeader({
  datasetId,
  service: s,
}: {
  datasetId: string;
  service: ServiceDiff;
}): React.ReactElement {
  const { change } = useCalendarPalette();
  const color = statusColor(change, s.status);
  const pattern = serviceListPattern(s.status, {
    base: s.base?.calendar ?? null,
    new: s.new?.calendar ?? null,
  });
  const routeCount = new Set([...s.route_ids.base, ...s.route_ids.new]).size;
  const chips: Array<{ label: string; color?: string }> = [
    {
      label: countLabel(
        s,
        s.base?.active_day_count ?? 0,
        s.new?.active_day_count ?? 0,
        'day',
      ),
    },
    ...(s.dates_gained.length > 0
      ? [{ label: `+${s.dates_gained.length} days`, color: change.added }]
      : []),
    ...(s.dates_lost.length > 0
      ? [{ label: `−${s.dates_lost.length} days`, color: change.removed }]
      : []),
    { label: countLabel(s, s.trip_counts.base, s.trip_counts.new, 'trip') },
    {
      label: `${routeCount.toLocaleString()} route${routeCount === 1 ? '' : 's'}`,
    },
  ];
  return (
    <ReportHeaderSlot>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          columnGap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Typography component='h2' color='text.secondary' sx={SUBHEAD_SX}>
          {pattern}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          component={Link}
          href={calendarPageHref(datasetId, { service: s.service_id })}
          size='small'
          startIcon={<CalendarMonth fontSize='small' />}
          sx={{ textTransform: 'none' }}
        >
          Show on calendar
        </Button>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          mt: 1,
        }}
      >
        <Chip
          variant='outlined'
          label={STATUS_LABELS[s.status]}
          sx={{
            fontWeight: 600,
            ...(color ? { color, borderColor: color } : {}),
          }}
        />
        {chips.map((c) => (
          <Chip
            key={c.label}
            variant='outlined'
            label={c.label}
            sx={{
              fontWeight: 600,
              ...(c.color ? { color: c.color, borderColor: c.color } : {}),
            }}
          />
        ))}
      </Box>
    </ReportHeaderSlot>
  );
}

// ── Service dates ──────────────────────────────────────────────────

const STATE_TEXT: Record<ServiceDayState, string> = {
  runs: 'Runs in both feeds',
  gained: 'Now runs (new feed only)',
  lost: 'No longer runs (old feed only)',
  added: 'Runs (service added)',
  removed: 'Ran (service removed)',
  exception: 'Same activity, exception changed',
};

const CELL = 24;

function DayCell({
  date,
  day,
  onOpen,
}: {
  date: GtfsDate;
  day: ServiceDay | undefined;
  onOpen: (d: GtfsDate) => void;
}): React.ReactElement {
  const { change } = useCalendarPalette();
  const state = day?.state;
  const fill =
    state === 'gained' || state === 'added'
      ? change.added
      : state === 'lost' || state === 'removed'
        ? change.removed
        : null;
  // Days whose service changed appear on the Service Dates calendar.
  const changed = state != null && state !== 'runs';
  const exc = day?.exception;
  const tip = (
    <Box>
      <Typography variant='caption' fontWeight={700} component='div'>
        {formatGtfsDate(date)}
      </Typography>
      <Typography variant='caption' component='div'>
        {state ? STATE_TEXT[state] : 'Doesn’t run'}
      </Typography>
      {exc ? (
        <Typography variant='caption' component='div'>
          Exception:{' '}
          {exc.base === exc.new
            ? exceptionLabel(exc.new)
            : `${exceptionLabel(exc.base)} → ${exceptionLabel(exc.new)}`}
        </Typography>
      ) : null}
      {changed ? (
        <Typography variant='caption' component='div'>
          Click to open the day.
        </Typography>
      ) : null}
    </Box>
  );
  return (
    <Tooltip title={tip} placement='top' disableInteractive>
      <Box
        role='gridcell'
        tabIndex={changed ? 0 : -1}
        aria-label={`${formatGtfsDate(date)}: ${state ? STATE_TEXT[state] : 'doesn’t run'}`}
        onClick={() => changed && onOpen(date)}
        onKeyDown={(e) => {
          if (changed && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpen(date);
          }
        }}
        sx={{
          width: CELL,
          height: CELL,
          borderRadius: '4px',
          fontSize: '0.62rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          color: fill ? '#fff' : state ? 'text.primary' : 'text.disabled',
          bgcolor: fill ?? (state ? 'action.selected' : 'transparent'),
          fontWeight: changed ? 700 : 400,
          cursor: changed ? 'pointer' : 'default',
          ...(state === 'exception'
            ? { border: '2px solid', borderColor: change.modified }
            : {}),
          ...(exc && state !== 'exception'
            ? { textDecoration: 'underline', textUnderlineOffset: '2px' }
            : {}),
          '&:hover': changed ? { transform: 'scale(1.15)' } : undefined,
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
          },
        }}
      >
        {+date.slice(6, 8)}
      </Box>
    </Tooltip>
  );
}

function LegendSwatch({
  label,
  sx,
}: {
  label: string;
  sx: Record<string, unknown>;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        aria-hidden
        sx={{
          width: 12,
          height: 12,
          borderRadius: '3px',
          boxSizing: 'border-box',
          ...sx,
        }}
      />
      <Typography variant='caption'>{label}</Typography>
    </Box>
  );
}

/** Small months from the service's first date to its last, either feed. */
function ServiceDatesCalendar({
  datasetId,
  service: s,
}: {
  datasetId: string;
  service: ServiceDiff;
}): React.ReactElement {
  const router = useRouter();
  const { change } = useCalendarPalette();
  const days = useMemo(() => serviceDays(s), [s]);
  const dates = [...days.keys()];
  const months = monthsBetween(dates[0] ?? null, dates.at(-1) ?? null);
  const open = (d: GtfsDate): void =>
    router.push(calendarPageHref(datasetId, { day: d }));
  if (months.length === 0)
    return (
      <Typography variant='body2' color='text.secondary'>
        The service runs on no date in either feed.
      </Typography>
    );
  const kept = s.status !== 'added' && s.status !== 'deleted';
  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${CELL * 7 + 6 * 3}px, 1fr))`,
          gap: 3,
        }}
      >
        {months.map((c) => (
          <Box key={`${c.year}-${c.month}`}>
            <Typography variant='body2' fontWeight={700} sx={{ mb: 0.5 }}>
              {MONTH_NAMES[c.month]} {c.year}
            </Typography>
            <Box
              role='grid'
              aria-label={`${MONTH_NAMES[c.month]} ${c.year}`}
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(7, ${CELL}px)`,
                gap: '3px',
              }}
            >
              {WEEKDAY_SHORT.map((w) => (
                <Typography
                  key={w}
                  variant='caption'
                  color='text.secondary'
                  sx={{ textAlign: 'center', fontSize: '0.6rem' }}
                >
                  {w.slice(0, 2)}
                </Typography>
              ))}
              {monthGrid(c)
                .flat()
                .map((d, i) =>
                  d == null ? (
                    <Box key={`pad-${i}`} />
                  ) : (
                    <DayCell key={d} date={d} day={days.get(d)} onOpen={open} />
                  ),
                )}
            </Box>
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: 2,
          rowGap: 0.75,
          mt: 2,
        }}
      >
        {kept ? (
          <>
            <LegendSwatch
              label='Runs in both feeds'
              sx={{ bgcolor: 'action.selected' }}
            />
            <LegendSwatch label='Now runs' sx={{ bgcolor: change.added }} />
            <LegendSwatch
              label='No longer runs'
              sx={{ bgcolor: change.removed }}
            />
            <LegendSwatch
              label='Exception changed only'
              sx={{ border: '2px solid', borderColor: change.modified }}
            />
          </>
        ) : (
          <LegendSwatch
            label={s.status === 'added' ? 'Runs (new feed)' : 'Ran (old feed)'}
            sx={{
              bgcolor: s.status === 'added' ? change.added : change.removed,
            }}
          />
        )}
        <Typography variant='caption' color='text.secondary'>
          Underlined: a calendar_dates.txt exception applies.
        </Typography>
      </Box>
    </Box>
  );
}

// ── Schedule ───────────────────────────────────────────────────────

/** Seven weekday boxes comparing the old and new regular pattern. */
function WeekdayPattern({
  service,
}: {
  service: ServiceDiff;
}): React.ReactElement {
  const { change } = useCalendarPalette();
  const b = weekdayFlags(service.base?.calendar);
  const n = weekdayFlags(service.new?.calendar);
  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      {WEEKDAY_SHORT.map((w, i) => {
        const before = service.base != null && b[i];
        const after = service.new != null && n[i];
        const gained = !before && after && service.base != null;
        const lost = before && !after && service.new != null;
        const color = gained ? change.added : lost ? change.removed : undefined;
        return (
          <Tooltip
            key={w}
            title={
              gained
                ? `Now runs on ${w}`
                : lost
                  ? `No longer runs on ${w}`
                  : after || before
                    ? `Runs on ${w}`
                    : `No regular ${w} service`
            }
          >
            <Box
              sx={{
                width: 38,
                py: 0.25,
                textAlign: 'center',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 700,
                border: '1px solid',
                borderColor: color ?? 'divider',
                bgcolor:
                  color ??
                  (after || before ? 'action.selected' : 'transparent'),
                color: color
                  ? '#fff'
                  : after || before
                    ? 'text.primary'
                    : 'text.disabled',
                textDecoration: lost ? 'line-through' : undefined,
              }}
            >
              {w}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function Fact({
  label,
  children,
}: React.PropsWithChildren<{ label: string }>): React.ReactElement {
  return (
    <Box>
      <Typography
        variant='caption'
        color='text.secondary'
        component='div'
        sx={{ mb: 0.5 }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}

function ScheduleDetails({
  datasetId,
  service: s,
}: {
  datasetId: string;
  service: ServiceDiff;
}): React.ReactElement {
  const router = useRouter();
  const { change } = useCalendarPalette();
  const ex = s.exception_changes;
  const exceptionRows = [
    ...ex.added.map((e) => ({
      date: e.date,
      change: 'Added',
      base: null,
      next: e.exception_type,
      color: change.added,
    })),
    ...ex.removed.map((e) => ({
      date: e.date,
      change: 'Removed',
      base: e.exception_type,
      next: null,
      color: change.removed,
    })),
    ...ex.modified.map((e) => ({
      date: e.date,
      change: 'Changed',
      base: e.base_exception_type,
      next: e.new_exception_type,
      color: change.modified,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const kept = s.status !== 'added' && s.status !== 'deleted';
  // A new or removed service: its exceptions in its one feed.
  const ownExceptions = kept
    ? []
    : ((s.status === 'added' ? s.new : s.base)?.exceptions ?? []);

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, auto)' },
          justifyContent: 'start',
          columnGap: 6,
          rowGap: 2,
          mb: 2,
        }}
      >
        <Fact label='Regular weekly pattern'>
          <WeekdayPattern service={s} />
        </Fact>
        <Fact label='Service period'>
          <Typography variant='body2'>
            {s.status === 'added'
              ? periodText(s.new)
              : s.status === 'deleted'
                ? periodText(s.base)
                : periodText(s.base) === periodText(s.new)
                  ? periodText(s.new)
                  : `${periodText(s.base)} → ${periodText(s.new)}`}
          </Typography>
        </Fact>
        <Fact label='Active days · trips'>
          <Typography variant='body2'>
            {countLabel(
              s,
              s.base?.active_day_count ?? 0,
              s.new?.active_day_count ?? 0,
              'day',
            )}{' '}
            · {countLabel(s, s.trip_counts.base, s.trip_counts.new, 'trip')}
          </Typography>
        </Fact>
      </Box>

      {s.calendar_field_changes.length > 0 ? (
        <Box sx={{ mb: 2 }}>
          <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 0.5 }}>
            calendar.txt changes
          </Typography>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>Field</TableCell>
                <TableCell sx={headSx}>Before</TableCell>
                <TableCell sx={headSx}>After</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {s.calendar_field_changes.map((c) => (
                <TableRow key={c.field}>
                  <TableCell sx={monoCellSx}>{c.field}</TableCell>
                  <TableCell sx={{ ...monoCellSx, color: change.removed }}>
                    {c.base_value || '—'}
                  </TableCell>
                  <TableCell sx={{ ...monoCellSx, color: change.added }}>
                    {c.new_value || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : null}

      {exceptionRows.length > 0 || ownExceptions.length > 0 ? (
        <Box>
          <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 0.5 }}>
            {kept ? 'calendar_dates.txt changes' : 'calendar_dates.txt rows'}
          </Typography>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>Date</TableCell>
                {kept ? (
                  <>
                    <TableCell sx={headSx}>Change</TableCell>
                    <TableCell sx={headSx}>Before</TableCell>
                    <TableCell sx={headSx}>After</TableCell>
                  </>
                ) : (
                  <TableCell sx={headSx}>Exception</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {kept
                ? exceptionRows.map((r) => (
                    <TableRow
                      key={r.date}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() =>
                        router.push(
                          calendarPageHref(datasetId, { day: r.date }),
                        )
                      }
                    >
                      <TableCell sx={monoCellSx}>
                        {formatGtfsDate(r.date)}
                      </TableCell>
                      <TableCell
                        sx={{ ...monoCellSx, color: r.color, fontWeight: 700 }}
                      >
                        {r.change}
                      </TableCell>
                      <TableCell sx={monoCellSx}>
                        {r.base ? exceptionLabel(r.base) : '—'}
                      </TableCell>
                      <TableCell sx={monoCellSx}>
                        {r.next ? exceptionLabel(r.next) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                : ownExceptions.map((e) => (
                    <TableRow key={e.date}>
                      <TableCell sx={monoCellSx}>
                        {formatGtfsDate(e.date)}
                      </TableCell>
                      <TableCell sx={monoCellSx}>
                        {exceptionLabel(e.exception_type)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </Box>
      ) : kept && s.calendar_field_changes.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          Neither calendar.txt nor calendar_dates.txt changed for this service.
        </Typography>
      ) : null}
    </Box>
  );
}

// ── Routes ─────────────────────────────────────────────────────────

const PRESENCE_TEXT = {
  both: 'Both feeds',
  base: 'Old feed only',
  new: 'New feed only',
} as const;

function ServiceRoutesTable({
  datasetId,
  service,
  routes,
  linked,
}: {
  datasetId: string;
  service: ServiceDiff;
  routes: Record<string, RouteInfo>;
  linked: boolean;
}): React.ReactElement {
  const router = useRouter();
  const { change } = useCalendarPalette();
  const list = useMemo(() => serviceRoutes(service, routes), [service, routes]);
  if (list.length === 0)
    return (
      <Typography variant='body2' color='text.secondary'>
        No trips run on this service in either feed.
      </Typography>
    );
  // Presence only says something for a service in both feeds.
  const kept = service.status !== 'added' && service.status !== 'deleted';
  const open = (routeId: string): void =>
    router.push(
      tripsRouteHref(datasetId, routeId, { view: DEFAULT_TRIPS_VIEW }),
    );
  return (
    <Table size='small'>
      <TableHead>
        <TableRow>
          <TableCell sx={headSx}>Route</TableCell>
          {kept ? (
            <TableCell sx={headSx}>Runs on this service</TableCell>
          ) : null}
        </TableRow>
      </TableHead>
      <TableBody>
        {list.map(({ routeId, presence }) => (
          <TableRow
            key={routeId}
            hover={linked}
            tabIndex={linked ? 0 : undefined}
            onClick={linked ? () => open(routeId) : undefined}
            onKeyDown={
              linked
                ? (e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    open(routeId);
                  }
                : undefined
            }
            sx={{ cursor: linked ? 'pointer' : undefined }}
          >
            <TableCell sx={{ py: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RouteChip
                  routeId={routeId}
                  route={routes[routeId]}
                  linked={false}
                />
                <Typography variant='body2' sx={{ fontSize: '0.8rem' }}>
                  {routes[routeId]?.long_name || routeId}
                </Typography>
              </Box>
            </TableCell>
            {kept ? (
              <TableCell
                sx={{
                  py: 0.75,
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                  ...(presence === 'new'
                    ? { color: change.added, fontWeight: 700 }
                    : presence === 'base'
                      ? { color: change.removed, fontWeight: 700 }
                      : {}),
                }}
              >
                {PRESENCE_TEXT[presence]}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Raw rows ───────────────────────────────────────────────────────

function ServiceRawDiff({
  datasetId,
  serviceId,
  rawTables,
}: {
  datasetId: string;
  serviceId: string;
  rawTables: RawTable[];
}): React.ReactElement {
  const [wholeFeed, setWholeFeed] = useState(false);
  return (
    <V2Card
      title='Raw file diff'
      scope={ALL_DATES}
      caption={
        rawTables.length > 0
          ? `Row by row changes to calendar.txt and calendar_dates.txt${wholeFeed ? ' across the whole feed' : ` for service ${serviceId}`}.`
          : 'Neither feed has calendar.txt or calendar_dates.txt rows that changed.'
      }
      actions={
        rawTables.length > 0 ? (
          <Button
            size='small'
            variant='outlined'
            color='inherit'
            onClick={() => setWholeFeed((v) => !v)}
            sx={{ textTransform: 'none', borderColor: 'divider' }}
          >
            {wholeFeed ? `Only service ${serviceId}` : 'Show the whole feed'}
          </Button>
        ) : null
      }
    >
      {rawTables.length > 0 ? (
        <RawTablesSection
          // Filters only apply on first render: remount when the scope changes.
          key={wholeFeed ? 'all' : `service:${serviceId}`}
          datasetId={datasetId}
          tables={rawTables}
          initialFilters={wholeFeed ? undefined : { keyId: serviceId }}
        />
      ) : null}
    </V2Card>
  );
}
