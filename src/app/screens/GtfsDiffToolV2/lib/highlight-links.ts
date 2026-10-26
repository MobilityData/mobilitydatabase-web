/**
 * Where a global highlight (lib/global-highlights) and the entities it
 * lists open: the entity's page, focused on the entity when the page
 * supports it (#stop/<id>, #route/<id>, #shape/<id>, #service/<id>).
 */

import type { EntityRow } from './highlights';
import type { RowKind } from './global-highlights';
import { sectionSlug } from './report';
import { tripsListHref, tripsRouteHref } from './trips-v2-routes';

/** Raw diff anchor of the Trips page (components/diffmap/DiffMapControls). */
const RAW_DIFF_ANCHOR = '#raw-diff';

export function highlightsHref(datasetId: string): string {
  return `/gtfs-diff-tool-v2/${datasetId}/highlights`;
}

/** The section's page; trips open in the Trips v2 view. */
export function sectionPageHref(datasetId: string, section: string): string {
  if (section === 'trips') return tripsListHref(datasetId);
  return `/gtfs-diff-tool-v2/${datasetId}/${sectionSlug(section)}`;
}

/** One entity of a list highlight, focused on its page. */
export function entityRowHref(
  datasetId: string,
  section: string,
  of: RowKind,
  row: EntityRow,
): string {
  const id = encodeURIComponent(row.openId ?? row.id);
  const base = (s: string): string =>
    `/gtfs-diff-tool-v2/${datasetId}/${sectionSlug(s)}`;
  switch (of) {
    case 'stop':
      return `${base('stops')}#stop/${id}`;
    case 'route':
      return section === 'trips'
        ? tripsRouteHref(datasetId, row.openId ?? row.id)
        : `${base('routes')}#route/${id}`;
    case 'shape':
      return `${base('routes')}#shape/${id}`;
    case 'service':
      return `${base('calendar')}#service/${id}`;
    default:
      return sectionPageHref(datasetId, section);
  }
}

/** The raw trip rows behind a trips highlight. */
export function tripsRawDiffHref(datasetId: string): string {
  return `${tripsListHref(datasetId)}${RAW_DIFF_ANCHOR}`;
}
