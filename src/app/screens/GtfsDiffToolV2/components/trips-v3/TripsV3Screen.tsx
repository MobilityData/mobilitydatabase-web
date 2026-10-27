'use client';

import { Alert, Box, Typography } from '@mui/material';
import React, { useState } from 'react';
import type { GtfsDate, GtfsEntityDiff } from '../../lib/entity-diff-types';
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
import DayTripsDialog from './DayTripsDialog';
import TripsCalendar from './TripsCalendar';
import WeekdayTable from './WeekdayTable';
import { TRIPS_V3_SECTION, TRIPS_V3_SLUG } from './shared';

interface TripsV3ScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
  /** trips-calendar.json; null when the dataset wasn't built with it. */
  calendar: TripsCalendarDoc | null;
  /** The trips section of highlights.json; null when not built. */
  highlights: GlobalHighlight[] | null;
}

/** The report with this page added, so the header titles it. */
function withTripsV3(report: ReportSummary): ReportSummary {
  const trips = report.sections.find((s) => s.id === 'trips');
  return {
    ...report,
    sections: [
      ...report.sections,
      {
        id: TRIPS_V3_SECTION,
        slug: TRIPS_V3_SLUG,
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
 * /gtfs-diff-tool-v2/<dataset>/trips-v3: notable highlights, trip changes
 * by weekday and by date (precomputed, scripts/generate-gtfs-trips-calendar.mjs),
 * a day's routes in a popup, and the raw rows. A route opens its own page
 * (/trips-v3/<route>), the same as Trips v2's.
 */
export default function TripsV3Screen({
  dataset,
  report,
  calendar,
  highlights,
}: TripsV3ScreenProps): React.ReactElement {
  const header = withTripsV3(report);
  const trips = useDiffData<TripsIndexDoc>(dataset.id, 'trips');
  const entity = useDiffData<GtfsEntityDiff>(dataset.id, 'entity');
  const category = entity.data?.categories.find((c) => c.id === 'trips');
  const [open, setOpen] = useState<GtfsDate | null>(null);
  const tripsLabel =
    report.sections.find((s) => s.id === 'trips')?.label ?? 'Trips';

  return (
    <ReportLayout dataset={dataset} report={header} section={TRIPS_V3_SECTION}>
      <V2Card title='Notable highlights' scope={ALL_DATES}>
        <NotableHighlights
          heading={false}
          highlights={highlights ?? []}
          emptyText={
            highlights == null
              ? 'Highlights aren’t built for this dataset yet.'
              : 'Nothing concerning stood out in the trips.'
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
        <>
          <V2Card title='Trip changes by weekday'>
            {calendar.mode === 'cross' ? (
              <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
                The feeds share no dates: each day of the new feed is compared
                with the old feed’s typical same weekday.
              </Typography>
            ) : null}
            <WeekdayTable calendar={calendar} onOpen={setOpen} />
          </V2Card>
          <V2Card title='Trip changes by date'>
            <TripsCalendar
              calendar={calendar}
              focused={open}
              onOpen={setOpen}
            />
          </V2Card>
          <DayTripsDialog
            datasetId={dataset.id}
            index={trips.data}
            calendar={calendar}
            date={open}
            onClose={() => setOpen(null)}
            onNavigate={setOpen}
          />
        </>
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
            fileDiffs={category?.file_diffs ?? []}
            routeId={null}
            routeLabel={null}
          />
        </Box>
      ) : null}
    </ReportLayout>
  );
}
