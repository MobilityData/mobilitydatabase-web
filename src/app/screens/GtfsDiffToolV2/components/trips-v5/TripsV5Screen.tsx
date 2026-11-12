'use client';

import { Alert, Box, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { GtfsEntityDiff } from '../../lib/entity-diff-types';
import type { DiffDataset } from '../../lib/datasets';
import type { ReportSummary } from '../../lib/report';
import type { TripsIndexDoc } from '../../lib/trips-shards';
import type { GlobalHighlight } from '../../lib/global-highlights';
import type { TripsCalendarDoc } from '../../lib/trips-calendar';
import { useDiffData } from '../../lib/useDiffData';
import ReportLayout from '../report/ReportLayout';
import NotableHighlights from '../overview/NotableHighlights';
import { HighlightDetails } from '../highlights/HighlightRow';
import RawDiffSection from '../trips-v2/RawDiffSection';
import { ALL_DATES, V2Card } from '../trips-v2/shared';
import { periodByDate, servicePeriods } from '../../lib/trips-periods';
import DayTripsDialog from '../trips-v3/DayTripsDialog';
import {
  CalendarPaletteProvider,
  CalendarPaletteSelect,
  useCalendarPaletteChoice,
} from './palette';
import ServicePeriodGroupsV2 from './ServicePeriodGroupsV2';
import TripsV5Calendar from './TripsV5Calendar';
import { useOpenDay } from './useOpenDay';

/** Section id and slug of the Trips v5 page in the report header. */
const TRIPS_V5_SECTION = 'trips_v5';
const TRIPS_V5_SLUG = 'trips-v5';

interface TripsV5ScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
  /** trips-calendar.json; null when the dataset wasn't built with it. */
  calendar: TripsCalendarDoc | null;
  /** The trips section of highlights.json; null when not built. */
  highlights: GlobalHighlight[] | null;
}

/** The report with this page added, so the header titles it. */
function withTripsV5(report: ReportSummary): ReportSummary {
  const trips = report.sections.find((s) => s.id === 'trips');
  return {
    ...report,
    sections: [
      ...report.sections,
      {
        id: TRIPS_V5_SECTION,
        slug: TRIPS_V5_SLUG,
        label: trips?.label ?? 'Trips',
        count: trips?.count ?? null,
        counts: trips?.counts ?? null,
        files: trips?.files ?? ['trips.txt', 'stop_times.txt'],
        present: true,
      },
    ],
  };
}

/**
 * /gtfs-diff-tool-v2/<dataset>/trips-v5: Trips v3 reordered around the
 * calendar. Notable highlights, then trip changes by date (a Service Dates
 * style calendar, precomputed by scripts/generate-gtfs-trips-calendar.mjs),
 * the service periods as tables under it, dotted by day kind
 * (lib/trips-v5-day-kinds), and the raw rows. A day opens its
 * routes in Trips v3's popup.
 */
export default function TripsV5Screen({
  dataset,
  report,
  calendar,
  highlights,
}: TripsV5ScreenProps): React.ReactElement {
  const header = withTripsV5(report);
  const trips = useDiffData<TripsIndexDoc>(dataset.id, 'trips');
  const entity = useDiffData<GtfsEntityDiff>(dataset.id, 'entity');
  const category = entity.data?.categories.find((c) => c.id === 'trips');
  const [palette, choosePalette] = useCalendarPaletteChoice();
  const { open, openDay, navigateDay, closeDay } = useOpenDay(calendar);
  // Periods singled out in the calendar while a table row hovers them.
  const [hovered, setHovered] = useState<string[] | null>(null);
  const periods = useMemo(
    () => (calendar ? servicePeriods(calendar) : null),
    [calendar],
  );
  const byDate = useMemo(() => periodByDate(periods ?? []), [periods]);
  const tripsLabel =
    report.sections.find((s) => s.id === 'trips')?.label ?? 'Trips';

  return (
    <ReportLayout dataset={dataset} report={header} section={TRIPS_V5_SECTION}>
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

      {calendar == null ? (
        <Alert severity='info' sx={{ mb: 3 }}>
          This dataset has no trip calendar yet. Build it with{' '}
          <code>
            node scripts/build-gtfs-diff-dataset.mjs {dataset.id} --only
            calendar
          </code>
          .
        </Alert>
      ) : (
        <CalendarPaletteProvider value={palette}>
          <V2Card
            title='Trip changes by date'
            actions={
              <CalendarPaletteSelect value={palette} onChange={choosePalette} />
            }
          >
            {calendar.mode === 'cross' ? (
              <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
                The feeds share no dates: each day of the new feed is compared
                with the old feed’s typical same weekday.
              </Typography>
            ) : null}
            <TripsV5Calendar
              calendar={calendar}
              periods={periods ?? []}
              hovered={hovered}
              focused={open}
              onOpen={openDay}
            />
          </V2Card>
          <V2Card title='Service period groups'>
            <ServicePeriodGroupsV2
              periods={periods ?? []}
              onHover={setHovered}
              onOpen={openDay}
            />
          </V2Card>
          <DayTripsDialog
            datasetId={dataset.id}
            index={trips.data}
            calendar={calendar}
            period={open ? byDate[open] : undefined}
            date={open}
            onClose={closeDay}
            onNavigate={navigateDay}
            categorized
            routeView='trips-v5'
          />
        </CalendarPaletteProvider>
      )}

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
