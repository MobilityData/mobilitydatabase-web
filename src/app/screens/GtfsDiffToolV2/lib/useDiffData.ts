'use client';

import useSWRImmutable from 'swr/immutable';
import { type DiffFileKind, diffDataUrl, diffFileUrl } from './datasets';
import { type Json, decodeDeep, decodeEntityDiff } from './entity-diff-codec';
import type { EntityCategoryDiff, GtfsEntityDiff } from './entity-diff-types';

/**
 * entity-diff.json: expand the compact encoding, and resolve the URLs of
 * change lists stored as Parquet against the diff's base URL.
 */
function prepareEntityDiff(raw: unknown, datasetId: string): unknown {
  const doc = decodeEntityDiff(raw as GtfsEntityDiff);
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
