'use client';

import { Alert, Box, Button, Typography } from '@mui/material';
import { Link, useRouter } from '../../../i18n/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GtfsEntityDiff } from './lib/entity-diff-types';
import CalendarEntityPanel from './components/calendar/CalendarEntityPanel';
import GenericEntityPanel from './components/GenericEntityPanel';
import TransitLoader from './components/TransitLoader';
import StopsEntityPanel from './components/stops/StopsEntityPanel';
import RoutesEntityPanel from './components/routes/RoutesEntityPanel';
import TripsEntityPanel from './components/trips/TripsEntityPanel';
import ReportLayout from './components/report/ReportLayout';
import {
  type DiffNav,
  DiffNavProvider,
  type NavFocus,
  type NavTarget,
  parseLocationHash,
  toFocusHash,
} from './lib/diff-nav';
import { DATASET_BUILDER, type DiffDataset } from './lib/datasets';
import { type ReportSummary, sectionSlug } from './lib/report';
import { useCategoryDetail, useDiffData } from './lib/useDiffData';
import { ForeignKeyLinks } from './lib/foreign-keys';

interface GtfsDiffToolV2Props {
  dataset: DiffDataset;
  report: ReportSummary;
  /** Entity-diff category shown on this page (calendar, stops, …). */
  section: string;
}

/** One entity of a dataset's diff: /gtfs-diff-tool-v2/<dataset>/<entity>. */
export default function GtfsDiffToolV2({
  dataset,
  report,
  section,
}: GtfsDiffToolV2Props): React.ReactElement {
  const { data, error } = useDiffData<GtfsEntityDiff>(dataset.id, 'entity');
  return (
    <ReportLayout dataset={dataset} report={report} section={section}>
      {data != null ? (
        <EntitySection diff={data} dataset={dataset} section={section} />
      ) : error != null ? (
        <Alert severity='error'>
          Could not load the entity diff of {dataset.label}: {error.message}
        </Alert>
      ) : (
        <TransitLoader label={`Loading ${dataset.label}…`} />
      )}
    </ReportLayout>
  );
}

/** Shown for a dataset folder without any diff file. */
export function MissingDiff({
  dataset,
}: {
  dataset: DiffDataset;
}): React.ReactElement {
  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 4, px: 2 }}>
      <Typography variant='h4' fontWeight={700} sx={{ mb: 2 }}>
        {dataset.label}
      </Typography>
      <Alert severity='info'>
        This dataset has no entity-diff.json yet. With its two GTFS zips in the
        folder ({dataset.feeds.length} found), build every diff file with:
        <Box
          component='pre'
          sx={{ m: 0, mt: 1, whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}
        >
          {`node ${DATASET_BUILDER} ${dataset.id}`}
        </Box>
      </Alert>
      <Button component={Link} href='/gtfs-diff-tool-v2' sx={{ mt: 2 }}>
        ← All datasets
      </Button>
    </Box>
  );
}

function EntitySection({
  diff,
  dataset,
  section,
}: {
  diff: GtfsEntityDiff;
  dataset: DiffDataset;
  section: string;
}): React.ReactElement {
  const router = useRouter();
  const summary = diff.categories.find((c) => c.id === section);
  // Maps, calendar and file diffs live in the category's own file.
  const detail = useCategoryDetail(dataset.id, summary);
  const active = detail.data;
  const [focus, setFocus] = useState<NavFocus | null>(null);
  const nonce = useRef(0);

  const focusOn = useCallback((t: NavTarget) => {
    nonce.current += 1;
    setFocus(t.kind && t.id ? { ...t, nonce: nonce.current } : null);
  }, []);

  const entityHref = useCallback(
    (t: NavTarget) =>
      `/gtfs-diff-tool-v2/${dataset.id}/${sectionSlug(t.tab)}${toFocusHash(t)}`,
    [dataset.id],
  );

  const nav = useMemo<DiffNav>(
    () => ({
      navigate: (t) => {
        if (t.tab !== section) {
          router.push(entityHref(t));
          return;
        }
        focusOn(t);
        const { pathname, search } = window.location;
        window.history.pushState(null, '', pathname + search + toFocusHash(t));
      },
      replaceTarget: (t) => {
        // Ignore late updates from a page being left (e.g. a popup closing on unmount).
        if (t.tab !== section) return;
        const { pathname, search } = window.location;
        window.history.replaceState(
          null,
          '',
          pathname + search + toFocusHash(t),
        );
      },
    }),
    [section, router, entityHref, focusOn],
  );

  // Focus from the hash on load and on back/forward; links from before each
  // entity had its own page (#routes/route/M1) move to that entity's page.
  useEffect(() => {
    const fromHash = (): void => {
      const t = parseLocationHash(window.location.hash, section);
      if (t == null) {
        setFocus(null);
      } else if (t.tab !== section) {
        router.replace(entityHref(t));
      } else {
        focusOn(t);
      }
    };
    fromHash();
    window.addEventListener('popstate', fromHash);
    return () => window.removeEventListener('popstate', fromHash);
  }, [section, router, entityHref, focusOn]);

  if (summary == null) {
    return (
      <Alert severity='warning'>
        {dataset.label} has no “{section}” section.
      </Alert>
    );
  }
  if (detail.error != null) {
    return (
      <Alert severity='error'>
        Could not load the {summary.label} details ({summary.detail}):{' '}
        {detail.error.message}
      </Alert>
    );
  }
  if (active == null) {
    return <TransitLoader label={`Loading ${summary.label}…`} />;
  }

  return (
    <DiffNavProvider value={nav}>
      <ForeignKeyLinks datasetId={dataset.id}>
        {active.calendar ? (
          <CalendarEntityPanel
            datasetId={dataset.id}
            calendar={active.calendar}
            fileDiffs={active.file_diffs ?? []}
            focus={focus}
          />
        ) : active.stops_map ? (
          <StopsEntityPanel
            datasetId={dataset.id}
            stopsMap={active.stops_map}
            entityTypes={active.entity_types ?? []}
            fileDiffs={active.file_diffs ?? []}
            focus={focus}
          />
        ) : active.routes_map ? (
          <RoutesEntityPanel
            datasetId={dataset.id}
            routesMap={active.routes_map}
            entityTypes={active.entity_types ?? []}
            fileDiffs={active.file_diffs ?? []}
            rawTables={active.raw_tables ?? []}
            focus={focus}
          />
        ) : active.id === 'trips' ? (
          <TripsEntityPanel
            datasetId={dataset.id}
            entityTypes={active.entity_types ?? []}
            rawTables={active.raw_tables}
            tripMatching={active.trip_matching}
            focus={focus}
          />
        ) : (
          <GenericEntityPanel entityTypes={active.entity_types ?? []} />
        )}
      </ForeignKeyLinks>
    </DiffNavProvider>
  );
}
