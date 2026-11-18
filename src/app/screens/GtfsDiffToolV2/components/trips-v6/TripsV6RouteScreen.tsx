'use client';

import { Alert, Box, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import { useRouter } from '../../../../../i18n/navigation';
import type { GtfsDate, GtfsEntityDiff } from '../../lib/entity-diff-types';
import type { DiffDataset } from '../../lib/datasets';
import type { ReportSummary } from '../../lib/report';
import type { TripsIndexDoc } from '../../lib/trips-shards';
import type { GlobalHighlight } from '../../lib/global-highlights';
import type { TripsCalendarDoc } from '../../lib/trips-calendar';
import { routeCalendar, routeTotals } from '../../lib/trips-day-routes';
import { servicePeriods } from '../../lib/trips-periods';
import { routeHighlights } from '../../lib/trips-v5-route-highlights';
import { tripsListHref, tripsRouteHref } from '../../lib/trips-v2-routes';
import { useDiffData } from '../../lib/useDiffData';
import { useDayRoutes } from '../../lib/useDayRoutes';
import ReportLayout from '../report/ReportLayout';
import NotableHighlights from '../overview/NotableHighlights';
import { HighlightDetails } from '../highlights/HighlightRow';
import RawDiffSection from '../trips-v2/RawDiffSection';
import { ALL_DATES, V2Card } from '../trips-v2/shared';
import TransitLoader from '../TransitLoader';
import { ChangeTriplet } from '../trips-v3/shared';
import { MainChangeChips } from '../trips-v5/MainChangeChips';
import {
  CalendarPaletteProvider,
  CalendarPaletteSelect,
  useCalendarPaletteChoice,
} from '../trips-v5/palette';
import ServicePeriodGroupsV2 from '../trips-v5/ServicePeriodGroupsV2';
import TripsV5Calendar from '../trips-v5/TripsV5Calendar';
import { emptyCounts } from '../../lib/trips-calendar';
import { TRIPS_V6_SECTION, dayRoutesHint, withTripsV6 } from './shared';

interface TripsV6RouteScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
  routeId: string;
  /** views/trips/calendar.json; null when the dataset wasn't built with it. */
  calendar: TripsCalendarDoc | null;
  /** The trips section of highlights/index.json; null when not built. */
  highlights: GlobalHighlight[] | null;
}

/**
 * /gtfs-diff-tool-v2/<dataset>/trips-v6/<route_id>: the Trips v5 page for
 * one route. Its highlights, its trip changes by date (the calendar's
 * comparisons with the route's counts, lib/trips-day-routes routeCalendar),
 * the service periods under it, and the route's raw rows. A date opens the
 * route's trips that day (/trips-v6/<route_id>/detail?day=…).
 */
export default function TripsV6RouteScreen({
  dataset,
  report,
  routeId,
  calendar,
  highlights,
}: TripsV6RouteScreenProps): React.ReactElement {
  const router = useRouter();
  const header = useMemo(() => withTripsV6(report), [report]);
  const trips = useDiffData<TripsIndexDoc>(dataset.id, 'trips');
  const entity = useDiffData<GtfsEntityDiff>(dataset.id, 'entity');
  const dayRoutes = useDayRoutes(dataset.id);
  const category = entity.data?.categories.find((c) => c.id === 'trips');
  const tripsLabel =
    report.sections.find((s) => s.id === 'trips')?.label ?? 'Trips';
  const [palette, choosePalette] = useCalendarPaletteChoice();
  // Periods singled out in the calendar while a table row hovers them.
  const [hovered, setHovered] = useState<string[] | null>(null);

  const info = trips.data?.routes[routeId];
  const routeLabel = info?.short_name || routeId;
  const ownHighlights = useMemo(
    () => (highlights ? routeHighlights(highlights, routeId) : null),
    [highlights, routeId],
  );
  const routeCal = useMemo(
    () =>
      calendar && dayRoutes.rows
        ? routeCalendar(dayRoutes.rows, calendar, routeId)
        : null,
    [calendar, dayRoutes.rows, routeId],
  );
  const total = useMemo(
    () =>
      calendar && dayRoutes.rows
        ? routeTotals(
            dayRoutes.rows.filter((r) => r.route === routeId),
            calendar,
          )[0]
        : undefined,
    [calendar, dayRoutes.rows, routeId],
  );
  const periods = useMemo(
    () => (routeCal ? servicePeriods(routeCal) : null),
    [routeCal],
  );

  // A date opens the route's trips that day (its comparison key, as the
  // Trips v5 popup does).
  const openDay = (date: GtfsDate): void => {
    const key = calendar?.days[date]?.key ?? date;
    router.push(
      tripsRouteHref(dataset.id, routeId, { day: key, view: 'trips-v6' }),
    );
  };

  let byDate: React.ReactElement;
  if (calendar == null)
    byDate = (
      <Alert severity='info' sx={{ mb: 3 }}>
        This dataset has no trip calendar yet. Build it with{' '}
        <code>{dayRoutesHint(dataset.id)}</code>.
      </Alert>
    );
  else if (dayRoutes.error != null)
    byDate = (
      <Alert severity='info' sx={{ mb: 3 }}>
        This dataset’s trip calendar was built before Trips v6 (no
        views/trips/day-routes.parquet). Rebuild it with{' '}
        <code>{dayRoutesHint(dataset.id)}</code>.
      </Alert>
    );
  else if (routeCal == null || periods == null)
    byDate = <TransitLoader label='Loading the route’s trips…' />;
  else if (total == null)
    byDate = (
      <Alert severity='info' sx={{ mb: 3 }}>
        Route {routeLabel} runs no trip on any compared date.
      </Alert>
    );
  else
    byDate = (
      <CalendarPaletteProvider value={palette}>
        <V2Card
          title='Trip changes by date'
          actions={
            <CalendarPaletteSelect value={palette} onChange={choosePalette} />
          }
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1.5,
              mb: 1.5,
            }}
          >
            <Typography variant='body2' sx={{ fontWeight: 700 }}>
              All dates:
            </Typography>
            <ChangeTriplet
              counts={{
                ...emptyCounts(),
                added: total.added,
                removed: total.removed,
                modified: total.modified,
              }}
            />
            <Typography variant='body2' color='text.secondary'>
              changes on {total.days.toLocaleString()} of{' '}
              {total.serviceDays.toLocaleString()} dates with service
            </Typography>
            <MainChangeChips categories={total.categories} />
          </Box>
          {calendar.mode === 'cross' ? (
            <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
              The feeds share no dates: each day of the new feed is compared
              with the old feed’s typical same weekday.
            </Typography>
          ) : null}
          <TripsV5Calendar
            calendar={routeCal}
            periods={periods}
            hovered={hovered}
            focused={null}
            onOpen={openDay}
          />
        </V2Card>
        <V2Card title='Service period groups'>
          <ServicePeriodGroupsV2
            periods={periods}
            onHover={setHovered}
            onOpen={openDay}
          />
        </V2Card>
      </CalendarPaletteProvider>
    );

  return (
    <ReportLayout
      dataset={dataset}
      report={header}
      section={TRIPS_V6_SECTION}
      subpage={{
        label: routeLabel,
        title: info?.long_name
          ? `Trips: ${routeLabel} · ${info.long_name}`
          : `Trips: ${routeLabel}`,
        href: tripsListHref(dataset.id, undefined, undefined, 'trips-v6'),
      }}
      hideFeeds
    >
      <V2Card title='Notable highlights' scope={ALL_DATES}>
        <NotableHighlights
          heading={false}
          highlights={ownHighlights ?? []}
          emptyText={
            ownHighlights == null
              ? 'Highlights aren’t built for this dataset yet.'
              : `Nothing to flag on route ${routeLabel}.`
          }
          renderDetails={(h) =>
            h.entities ? (
              <HighlightDetails
                highlight={h}
                datasetId={dataset.id}
                sectionLabel={tripsLabel}
              />
            ) : null
          }
        />
      </V2Card>

      {byDate}

      {entity.error != null ? (
        <Alert severity='warning'>
          Could not load the raw file diff: {entity.error.message}
        </Alert>
      ) : entity.data != null ? (
        <Box>
          <RawDiffSection
            datasetId={dataset.id}
            rawTables={category?.raw_tables ?? []}
            tripMatching={category?.trip_matching}
            routeId={routeId}
            routeLabel={routeLabel}
          />
        </Box>
      ) : null}
    </ReportLayout>
  );
}
