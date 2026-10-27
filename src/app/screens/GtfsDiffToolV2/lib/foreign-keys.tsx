'use client';

import React, { useMemo } from 'react';
import { useRouter } from '../../../../i18n/navigation';
import {
  type ValueLinker,
  ValueLinkContext,
} from '../../GtfsDiffTool/components/GtfsDiffFileDiffPanel';
import { type NavTarget, toFocusHash, useDiffNav } from './diff-nav';
import { sectionSlug } from './report';

/**
 * GTFS foreign keys with a report page that can show the referenced entity
 * selected. A value in one of these columns links there from the raw file
 * diffs: route_id in trips.txt opens the Routes page with that route.
 */
const FOREIGN_KEYS: Record<string, Pick<NavTarget, 'tab' | 'kind'>> = {
  route_id: { tab: 'routes', kind: 'route' },
  shape_id: { tab: 'routes', kind: 'shape' },
  stop_id: { tab: 'stops', kind: 'stop' },
  parent_station: { tab: 'stops', kind: 'stop' },
  from_stop_id: { tab: 'stops', kind: 'stop' },
  to_stop_id: { tab: 'stops', kind: 'stop' },
  service_id: { tab: 'calendar', kind: 'service' },
};

/** Where a value of `column` links to, or null when it isn't a linked key. */
export function foreignKeyTarget(
  column: string,
  value: string | null | undefined,
): NavTarget | null {
  const fk = FOREIGN_KEYS[column];
  if (fk == null || value == null || value === '') return null;
  return { ...fk, id: value };
}

const PAGE_NAMES: Record<string, string> = {
  routes: 'Routes',
  stops: 'Stops',
  calendar: 'Service Dates',
};

/**
 * Opens foreign keys through the report's navigation when the page has it
 * (same-page targets are focused in place), else by going to the entity
 * page of `datasetId` (e.g. from the trips-v2 page).
 */
export function useForeignKeyLinker(datasetId: string): ValueLinker {
  const nav = useDiffNav();
  const router = useRouter();
  return useMemo<ValueLinker>(
    () => ({
      isLinked: (column, value) => foreignKeyTarget(column, value) != null,
      describe: (column, value) => {
        const t = foreignKeyTarget(column, value);
        return t
          ? `Open ${t.kind} ${value} in ${PAGE_NAMES[t.tab] ?? t.tab}`
          : '';
      },
      open: (column, value) => {
        const t = foreignKeyTarget(column, value);
        if (t == null) return;
        if (nav) nav.navigate(t);
        else
          router.push(
            `/gtfs-diff-tool-v2/${encodeURIComponent(datasetId)}/${sectionSlug(t.tab)}${toFocusHash(t)}`,
          );
      },
    }),
    [nav, router, datasetId],
  );
}

/** Makes foreign keys in the file diff panels below link to their pages. */
export function ForeignKeyLinks({
  datasetId,
  children,
}: React.PropsWithChildren<{ datasetId: string }>): React.ReactElement {
  const linker = useForeignKeyLinker(datasetId);
  return (
    <ValueLinkContext.Provider value={linker}>
      {children}
    </ValueLinkContext.Provider>
  );
}
