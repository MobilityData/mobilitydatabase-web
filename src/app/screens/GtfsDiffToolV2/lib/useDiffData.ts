'use client';

import useSWRImmutable from 'swr/immutable';
import { type DiffFileKind, diffDataUrl, diffFileUrl } from './datasets';
import type {
  EntityCategoryDiff,
  FilesDoc,
  RouteInfo,
} from './entity-diff-types';
import { type ReportDoc, filesDocFromReport } from './report';
import { entityDiffFromFiles } from './sections';
import type { HighlightsFile } from './highlights';
import { loadRouteInfo, loadStopNames, withPathwaysStops } from './lookups';
import type { PathwaysDiff } from './pathways-types';
import { expandServiceSets } from './trips-index-codec';
import type { TripsDiffDoc } from './trips-types';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

/**
 * A document's `routes` from the shared lookup its `route_info_file` names
 * (older builds stored `routes` inline); none without either, as for a diff
 * with no routes table.
 */
async function withRoutes<
  T extends { routes?: Record<string, RouteInfo>; route_info_file?: string },
>(doc: T, datasetId: string): Promise<T> {
  if (doc.routes != null) return doc;
  if (doc.route_info_file == null) return { ...doc, routes: {} };
  const routes = await loadRouteInfo(
    diffFileUrl(datasetId, doc.route_info_file),
  );
  return { ...doc, routes };
}

/**
 * The Trips index's stop names from the stops.txt raw table its
 * `stop_info_file` names (older builds stored `stops` inline).
 */
async function withStopNames(
  doc: TripsDiffDoc,
  datasetId: string,
): Promise<TripsDiffDoc> {
  if (doc.stops != null) return doc;
  if (doc.stop_info_file == null) return { ...doc, stops: {} };
  const stops = await loadStopNames(diffFileUrl(datasetId, doc.stop_info_file));
  return { ...doc, stops };
}

/** Files that need work right after fetching. */
const PREPARE: Partial<
  Record<DiffFileKind, (doc: unknown, datasetId: string) => Promise<unknown>>
> = {
  // report.json's files grouped into the viewer's pages (lib/sections);
  // older builds keep the entries in files.json.
  entity: async (doc, datasetId) =>
    entityDiffFromFiles(
      (doc as { schema?: number }).schema === 4
        ? filesDocFromReport(doc as ReportDoc)
        : ((await fetchJson(diffFileUrl(datasetId, 'files.json'))) as FilesDoc),
    ),
  // Service sets are stored as indices into one service_id list; route and
  // stop names come from the raw tables.
  trips: async (doc, datasetId) => {
    const [withNames, routes] = await Promise.all([
      withStopNames(doc as TripsDiffDoc, datasetId),
      withRoutes(doc as TripsDiffDoc, datasetId),
    ]);
    return expandServiceSets({ ...withNames, routes: routes.routes });
  },
  // Station and node stops.txt rows come from the stops.txt raw table.
  pathways: async (doc, datasetId) =>
    withPathwaysStops(doc as PathwaysDiff, (path) =>
      diffFileUrl(datasetId, path),
    ),
};

export interface DiffData<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
}

/**
 * Fetch one generated diff file of a dataset. Immutable: the files are static
 * build outputs, so they are fetched once per page load and shared by every
 * component that asks for the same file.
 */
export function useDiffData<T>(
  datasetId: string,
  kind: DiffFileKind,
): DiffData<T> {
  const prepare = PREPARE[kind];
  const { data, error, isLoading } = useSWRImmutable<unknown, Error>(
    diffDataUrl(datasetId, kind),
    async (url: string) => {
      const doc = await fetchJson(url);
      return prepare ? prepare(doc, datasetId) : doc;
    },
  );
  return { data: data as T | undefined, error, isLoading };
}

const NO_ROUTES: Record<string, RouteInfo> = {};

/**
 * Names, colours and feeds of every route (loadRouteInfo), shared by the
 * stops and routes maps: read once per page load. Empty until loaded,
 * or when the diff has none (`path` unset).
 */
export function useRouteInfo(
  datasetId: string,
  path: string | null | undefined,
): Record<string, RouteInfo> {
  const { data } = useSWRImmutable<Record<string, RouteInfo>, Error>(
    path ? diffFileUrl(datasetId, path) : null,
    loadRouteInfo,
  );
  return data ?? NO_ROUTES;
}

/**
 * A section's highlights with their full entity lists
 * (highlights/<section>.json), the only copy of them. Nothing is fetched
 * until `path` is set; then once per page load.
 */
export function useHighlightsFile(
  datasetId: string,
  path: string | null | undefined,
): DiffData<HighlightsFile> {
  const { data, error, isLoading } = useSWRImmutable<HighlightsFile, Error>(
    path ? diffFileUrl(datasetId, path) : null,
    async (url: string) => (await fetchJson(url)) as HighlightsFile,
  );
  return { data, error, isLoading };
}

/**
 * One page with its analysis's JSON (analysis/stops.json, analysis/routes.json,
 * analysis/services.json) merged in. Pages without one are returned as they
 * are; the JSON is fetched once and shared like the other files.
 */
export function useCategoryDetail(
  datasetId: string,
  category: EntityCategoryDiff | undefined,
): DiffData<EntityCategoryDiff> {
  const path = category?.detail;
  const key = category?.detail_key;
  const { data, error, isLoading } = useSWRImmutable<
    Partial<EntityCategoryDiff>,
    Error
  >(path ? diffFileUrl(datasetId, path) : null, async (url: string) => {
    // An analysis's JSON (analysis/stops.json…) fills the page's field.
    const decoded = await fetchJson(url);
    const doc = (
      key ? { [key]: decoded } : decoded
    ) as Partial<EntityCategoryDiff>;
    // The calendar's route chips come from the shared route lookup.
    return doc.calendar
      ? { ...doc, calendar: await withRoutes(doc.calendar, datasetId) }
      : doc;
  });
  if (category == null)
    return { data: undefined, error: undefined, isLoading: false };
  if (path == null)
    return { data: category, error: undefined, isLoading: false };
  return {
    data: data != null ? { ...category, ...data } : undefined,
    error,
    isLoading,
  };
}
