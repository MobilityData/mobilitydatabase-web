'use client';

import { Alert, Typography } from '@mui/material';
import { Place } from '@mui/icons-material';
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from '../../../../../i18n/navigation';
import type { GtfsEntityDiff } from '../../lib/entity-diff-types';
import type { DiffDataset } from '../../lib/datasets';
import { type ReportSummary, sectionSlug } from '../../lib/report';
import {
  type DiffNav,
  DiffNavProvider,
  type NavTarget,
  parseLocationHash,
  toFocusHash,
} from '../../lib/diff-nav';
import { routeOfShapeQuery } from '../../lib/map-table-query';
import { mapTableUrl, queryMapTable } from '../../lib/useMapTable';
import { useCategoryDetail, useDiffData } from '../../lib/useDiffData';
import { ForeignKeyLinks } from '../../lib/foreign-keys';
import { type RowAction } from '../../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';
import ReportLayout from '../report/ReportLayout';
import EntityOverviewCard from '../overview/EntityOverviewCard';
import { RAW_DIFF_ID } from '../diffmap/DiffMapControls';
import TransitLoader from '../TransitLoader';
import RawFileDiffCard from '../raw/RawFileDiffCard';
import RoutesV2Workspace, {
  WORKSPACE_ID,
  setRouteParam,
} from './RoutesV2Workspace';

/** Files at the top of the raw diff, in order. */
const LEADING_FILES = ['routes.txt', 'shapes.txt'];

interface RoutesV2ScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
}

/**
 * /gtfs-diff-tool-v2/<dataset>/routes (also /routes-v2): the routes page as
 * a map workspace (list or one route beside the map), between the notable
 * highlights and the raw file diff. The original page is at /routes-v1.
 */
export default function RoutesV2Screen({
  dataset,
  report,
}: RoutesV2ScreenProps): React.ReactElement {
  const router = useRouter();
  const entity = useDiffData<GtfsEntityDiff>(dataset.id, 'entity');
  const summary = entity.data?.categories.find((c) => c.id === 'routes');
  const detail = useCategoryDetail(dataset.id, summary);
  const routesMap = detail.data?.routes_map ?? null;
  const [rawFocus, setRawFocus] = useState<{
    id: string;
    nonce: number;
  } | null>(null);

  /** Select a route and bring the workspace into view. */
  const showRoute = (id: string): void => {
    setRouteParam(id, 'push');
    document
      .getElementById(WORKSPACE_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const nav: DiffNav = {
    navigate: (t: NavTarget) => {
      if (t.tab === 'routes' && t.kind === 'route' && t.id) {
        showRoute(t.id);
        return;
      }
      router.push(
        `/gtfs-diff-tool-v2/${dataset.id}/${sectionSlug(t.tab)}${toFocusHash(t)}`,
      );
    },
    replaceTarget: () => undefined,
  };

  /** "See full change": the route's routes.txt row in the raw diff. */
  const showRouteRow = (id: string): void =>
    setRawFocus((f) => ({ id, nonce: (f?.nonce ?? 0) + 1 }));

  // Links from other pages focus with a hash (#route/<id>, #shape/<id>):
  // turn it into ?route=<id>, the route using the shape for a shape.
  useEffect(() => {
    if (routesMap == null) return;
    const t = parseLocationHash(window.location.hash, 'routes');
    if (t?.tab !== 'routes' || t.id == null) return;
    const id = t.id;
    if (t.kind === 'route') {
      setRouteParam(id, 'replace');
    } else if (t.kind === 'shape') {
      queryMapTable(mapTableUrl(dataset.id, routesMap.table), (v) =>
        routeOfShapeQuery(v, id),
      )
        .then((rows) => {
          if (rows[0]) setRouteParam(String(rows[0].route_id), 'replace');
        })
        .catch(() => undefined);
    }
  }, [routesMap == null]);

  /** "See on map" on a routes.txt row of the raw diff. */
  const seeOnMap: RowAction = {
    files: ['routes.txt'],
    label: 'See on map',
    icon: <Place fontSize='small' />,
    onClick: (identifier) => {
      if (identifier.route_id) showRoute(identifier.route_id);
    },
  };

  // One Parquet row table per file that changed.
  const rawTables = summary?.raw_tables ?? [];
  const rawCard = (name: string): React.ReactNode => {
    const table = rawTables.find((t) => t.file === name);
    return table ? (
      <RawFileDiffCard
        key={name}
        datasetId={dataset.id}
        table={table}
        rowAction={seeOnMap}
        focus={name === 'routes.txt' ? rawFocus : null}
      />
    ) : null;
  };

  const error = entity.error ?? detail.error;
  return (
    <ReportLayout dataset={dataset} report={report} section='routes'>
      {error != null ? (
        <Alert severity='error'>
          Could not load the routes of {dataset.label}: {error.message}
        </Alert>
      ) : routesMap == null || detail.data == null ? (
        entity.data != null && summary == null ? (
          <Alert severity='warning'>
            {dataset.label} has no routes section.
          </Alert>
        ) : (
          <TransitLoader label='Loading routes…' />
        )
      ) : (
        <DiffNavProvider value={nav}>
          <ForeignKeyLinks datasetId={dataset.id}>
            <EntityOverviewCard
              datasetId={dataset.id}
              highlights={routesMap.highlights}
              highlightsFile={routesMap.highlights_file}
              noun={(h) => (h.id === 'unused_shapes' ? 'shapes' : 'routes')}
              onOpen={(h) => (h.id !== 'unused_shapes' ? showRoute : undefined)}
              emptyText='Nothing concerning stood out: no route is removed, changes mode, drops stops or is re-routed.'
            />
            <Suspense fallback={<TransitLoader label='Loading routes…' />}>
              <RoutesV2Workspace
                datasetId={dataset.id}
                routesMap={routesMap}
                onSeeRouteRow={showRouteRow}
              />
            </Suspense>
            <Typography
              id={RAW_DIFF_ID}
              variant='h6'
              fontWeight={700}
              sx={{ mt: 4, mb: 2, scrollMarginTop: 96 }}
            >
              Raw file diff
            </Typography>
            {/* routes.txt, shapes.txt, then the other files; all collapsed. */}
            {rawCard('routes.txt')}
            {rawCard('shapes.txt')}
            {rawTables
              .filter((t) => !LEADING_FILES.includes(t.file))
              .map((t) => rawCard(t.file))}
          </ForeignKeyLinks>
        </DiffNavProvider>
      )}
    </ReportLayout>
  );
}
