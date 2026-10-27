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
import GtfsDiffFileDiffPanel, {
  type FileDiffFocus,
  type RowAction,
} from '../../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';
import ReportLayout from '../report/ReportLayout';
import EntityOverviewCard from '../overview/EntityOverviewCard';
import { RAW_DIFF_ID } from '../diffmap/DiffMapControls';
import TransitLoader from '../TransitLoader';
import ShapesFileDiff from './ShapesFileDiff';
import RoutesV2Workspace, {
  WORKSPACE_ID,
  setRouteParam,
} from './RoutesV2Workspace';

/** Files of the raw diff after routes.txt and shapes.txt, in order. */
const AREA_FILES = ['areas.txt', 'stop_areas.txt'];

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
  const [rawFocus, setRawFocus] = useState<FileDiffFocus | null>(null);

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
    setRawFocus((f) => ({
      file: 'routes.txt',
      identifier: { route_id: id },
      nonce: (f?.nonce ?? 0) + 1,
    }));

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

  const fileDiffs = detail.data?.file_diffs ?? [];
  const routesFile = fileDiffs.filter((f) => f.file_name === 'routes.txt');
  const shapesTable =
    summary?.raw_tables?.find((t) => t.file === 'shapes.txt') ?? null;
  const areaFiles = AREA_FILES.flatMap((name) =>
    fileDiffs.filter((f) => f.file_name === name),
  );

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
              highlights={routesMap.highlights}
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
            {/* routes.txt, shapes.txt, areas.txt, stop_areas.txt; all collapsed. */}
            {routesFile.length > 0 ? (
              <GtfsDiffFileDiffPanel
                fileDiffs={routesFile}
                showActionFilter={false}
                searchable
                rowAction={seeOnMap}
                focus={rawFocus}
              />
            ) : null}
            {shapesTable ? (
              <ShapesFileDiff datasetId={dataset.id} table={shapesTable} />
            ) : null}
            {areaFiles.length > 0 ? (
              <GtfsDiffFileDiffPanel
                fileDiffs={areaFiles}
                showActionFilter={false}
                searchable
              />
            ) : null}
          </ForeignKeyLinks>
        </DiffNavProvider>
      )}
    </ReportLayout>
  );
}
