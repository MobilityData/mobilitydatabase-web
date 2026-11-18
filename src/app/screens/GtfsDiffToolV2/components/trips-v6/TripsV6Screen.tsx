'use client';

import { Alert, Box, Button, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import { useRouter } from '../../../../../i18n/navigation';
import type { GtfsEntityDiff } from '../../lib/entity-diff-types';
import type { DiffDataset } from '../../lib/datasets';
import type { ReportSummary } from '../../lib/report';
import type { TripsIndexDoc } from '../../lib/trips-shards';
import type { GlobalHighlight } from '../../lib/global-highlights';
import type { TripsCalendarDoc } from '../../lib/trips-calendar';
import { routeTotals } from '../../lib/trips-day-routes';
import {
  type DayRouteFilters,
  NO_DAY_FILTERS,
  isFiltering,
} from '../../lib/trips-v5-day-filter';
import {
  filterRouteList,
  routeCategoryCounts,
  routeListRows,
} from '../../lib/trips-v6-routes';
import { tripsV6RouteHref } from '../../lib/trips-v2-routes';
import { useDiffData } from '../../lib/useDiffData';
import { useDayRoutes } from '../../lib/useDayRoutes';
import ReportLayout from '../report/ReportLayout';
import NotableHighlights from '../overview/NotableHighlights';
import { HighlightDetails } from '../highlights/HighlightRow';
import RawDiffSection from '../trips-v2/RawDiffSection';
import { ALL_DATES, V2Card } from '../trips-v2/shared';
import TransitLoader from '../TransitLoader';
import { MainChangeFilterBar } from '../trips-v5/MainChangeChips';
import RouteTotalsTable from './RouteTotalsTable';
import { TRIPS_V6_SECTION, dayRoutesHint, withTripsV6 } from './shared';

interface TripsV6ScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
  /** views/trips/calendar.json; null when the dataset wasn't built with it. */
  calendar: TripsCalendarDoc | null;
  /** The trips section of highlights/index.json; null when not built. */
  highlights: GlobalHighlight[] | null;
}

/**
 * /gtfs-diff-tool-v2/<dataset>/trips-v6: Trips v5 by route instead of by
 * date. Notable highlights, then every route ranked by its trips added,
 * removed and modified over the whole calendar (views/trips/day-routes.parquet,
 * lib/trips-day-routes), and the raw rows. A route opens its own Trips v5
 * style calendar (/trips-v6/<route_id>).
 */
export default function TripsV6Screen({
  dataset,
  report,
  calendar,
  highlights,
}: TripsV6ScreenProps): React.ReactElement {
  const router = useRouter();
  const header = useMemo(() => withTripsV6(report), [report]);
  const trips = useDiffData<TripsIndexDoc>(dataset.id, 'trips');
  const entity = useDiffData<GtfsEntityDiff>(dataset.id, 'entity');
  const dayRoutes = useDayRoutes(dataset.id);
  const category = entity.data?.categories.find((c) => c.id === 'trips');
  const tripsLabel =
    report.sections.find((s) => s.id === 'trips')?.label ?? 'Trips';
  const [filters, setFilters] = useState<DayRouteFilters>(NO_DAY_FILTERS);
  const [showQuiet, setShowQuiet] = useState(false);

  const all = useMemo(
    () =>
      calendar && dayRoutes.rows && trips.data
        ? routeListRows(
            routeTotals(dayRoutes.rows, calendar),
            trips.data.routes,
            dayRoutes.rows,
          )
        : null,
    [calendar, dayRoutes.rows, trips.data],
  );
  const changed = useMemo(
    () => (all ?? []).filter((r) => r.changed > 0),
    [all],
  );
  const quiet = (all?.length ?? 0) - changed.length;
  const categoryCounts = useMemo(() => routeCategoryCounts(changed), [changed]);
  const filtering = isFiltering(filters);
  const rows = useMemo(
    () =>
      filtering
        ? filterRouteList(all ?? [], filters)
        : showQuiet
          ? (all ?? [])
          : changed,
    [all, changed, filters, filtering, showQuiet],
  );

  let routes: React.ReactElement;
  if (calendar == null)
    routes = (
      <Alert severity='info'>
        This dataset has no trip calendar yet. Build it with{' '}
        <code>{dayRoutesHint(dataset.id)}</code>.
      </Alert>
    );
  else if (dayRoutes.error != null)
    routes = (
      <Alert severity='info'>
        This dataset’s trip calendar was built before Trips v6 (no
        views/trips/day-routes.parquet). Rebuild it with{' '}
        <code>{dayRoutesHint(dataset.id)}</code>.
      </Alert>
    );
  else if (all == null || trips.data == null)
    routes = <TransitLoader label='Loading routes…' />;
  else
    routes = (
      <>
        <MainChangeFilterBar
          counts={categoryCounts}
          filters={filters}
          onChange={setFilters}
        />
        {rows.length === 0 ? (
          <Typography variant='body2' color='text.secondary'>
            {filtering
              ? 'No routes match the filters.'
              : 'No route has trip changes.'}
          </Typography>
        ) : (
          <RouteTotalsTable
            key={`${filters.search}|${filters.categories.join()}|${showQuiet}`}
            rows={rows}
            routeInfo={trips.data.routes}
            selected={filters.categories}
            onOpen={(route) => router.push(tripsV6RouteHref(dataset.id, route))}
          />
        )}
        {!filtering && quiet > 0 ? (
          <Button
            size='small'
            onClick={() => setShowQuiet((v) => !v)}
            sx={{ mt: 1, textTransform: 'none' }}
          >
            {showQuiet
              ? 'Hide routes without trip changes'
              : `Show ${quiet.toLocaleString()} route${quiet === 1 ? '' : 's'} without trip changes`}
          </Button>
        ) : null}
      </>
    );

  return (
    <ReportLayout dataset={dataset} report={header} section={TRIPS_V6_SECTION}>
      <V2Card title='Notable highlights' scope={ALL_DATES}>
        <NotableHighlights
          heading={false}
          highlights={highlights ?? []}
          emptyText={
            highlights == null
              ? 'Highlights aren’t built for this dataset yet.'
              : 'Nothing to flag.'
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

      <V2Card
        title='Trip changes by route'
        caption='Trips added, removed and modified on each route, summed over every compared date. Most changed first.'
        scope={ALL_DATES}
      >
        {calendar?.mode === 'cross' ? (
          <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
            The feeds share no dates: each day of the new feed is compared with
            the old feed’s typical same weekday.
          </Typography>
        ) : null}
        {routes}
      </V2Card>

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
            routeId={null}
            routeLabel={null}
          />
        </Box>
      ) : null}
    </ReportLayout>
  );
}
