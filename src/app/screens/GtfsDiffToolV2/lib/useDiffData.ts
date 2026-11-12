'use client';

import useSWRImmutable from 'swr/immutable';
import { type DiffFileKind, diffDataUrl, diffFileUrl } from './datasets';
import { type Json, decodeDeep } from './entity-diff-codec';
import type {
  AllStops,
  AllStopsFile,
  EntityCategoryDiff,
  GtfsEntityDiff,
} from './entity-diff-types';
import type { HighlightsFile } from './highlights';
import { expandServiceSets } from './trips-index-codec';
import type { TripsDiffDoc } from './trips-types';

/**
 * entity-diff.json: resolve the URLs of change lists stored as Parquet
 * against the diff's base URL.
 */
function prepareEntityDiff(raw: unknown, datasetId: string): unknown {
  const doc = raw as GtfsEntityDiff;
  for (const cat of doc.categories)
    for (const et of cat.entity_types ?? [])
      if (et.changes_table)
        et.changes_table.url = diffFileUrl(datasetId, et.changes_table.path);
  return doc;
}

/** Files that need work right after fetching. */
const PREPARE: Partial<
  Record<DiffFileKind, (doc: unknown, datasetId: string) => unknown>
> = {
  entity: prepareEntityDiff,
  // Service sets are stored as indices into one service_id list.
  trips: (doc) => expandServiceSets(doc as TripsDiffDoc),
};

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

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

/** In-flight and loaded all-stops files, by URL: fetched once per page load. */
const allStopsLoads = new Map<string, Promise<AllStops>>();

/**
 * Every stop of both feeds (maps/all_stops_data.json). Kept out of the stops
 * map because only the overlays and links to unchanged stops need it.
 */
export function loadAllStops(
  datasetId: string,
  file: AllStopsFile,
): Promise<AllStops> {
  const url = diffFileUrl(datasetId, file.path);
  let p = allStopsLoads.get(url);
  if (p == null) {
    p = fetchJson(url) as Promise<AllStops>;
    p.catch(() => allStopsLoads.delete(url));
    allStopsLoads.set(url, p);
  }
  return p;
}

/** loadAllStops as a hook: nothing is fetched until `enabled`. */
export function useAllStops(
  datasetId: string,
  file: AllStopsFile,
  enabled: boolean,
): DiffData<AllStops> {
  const { data, error, isLoading } = useSWRImmutable<AllStops, Error>(
    enabled ? diffFileUrl(datasetId, file.path) : null,
    () => loadAllStops(datasetId, file),
  );
  return { data, error, isLoading };
}

/**
 * A section's highlights with their full entity lists
 * (<section>-highlights.json): the section's JSON keeps each list's first
 * rows only. Nothing is fetched until `path` is set; then once per page load.
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
 * One entity category with its detail file (categories/<id>.json: maps,
 * calendar, file diffs) merged in. Categories without one are returned as
 * they are; the detail is fetched once and shared like the other files.
 */
export function useCategoryDetail(
  datasetId: string,
  category: EntityCategoryDiff | undefined,
): DiffData<EntityCategoryDiff> {
  const path = category?.detail;
  const { data, error, isLoading } = useSWRImmutable<
    Partial<EntityCategoryDiff>,
    Error
  >(path ? diffFileUrl(datasetId, path) : null, async (url: string) => {
    const doc = await fetchJson(url);
    return decodeDeep(doc as Json) as Partial<EntityCategoryDiff>;
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
