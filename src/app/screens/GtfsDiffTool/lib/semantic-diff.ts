/**
 * Phase 2: Semantic Diffing
 *
 * Matches entities across two materialized feeds by natural key and produces
 * diff records with field-level deltas and downstream impact analysis.
 */

import {
  type DiffType,
  type EntityDiffRecord,
  type FieldDelta,
  type MaterializedFeed,
  type MaterializedRoute,
  type MaterializedServicePeriod,
  type MaterializedStop,
  type MaterializedTrip,
  type RouteImpact,
} from './gtfs-types';

// ── Helpers ────────────────────────────────────────────────────────

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function recordsEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (!arraysEqual(keysA, keysB)) return false;
  for (const key of keysA) {
    if (!arraysEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Compare two values and return a FieldDelta if different, null if same.
 */
function compareField(
  field: string,
  oldVal: unknown,
  newVal: unknown,
): FieldDelta | null {
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    if (arraysEqual(oldVal as string[], newVal as string[])) return null;
  } else if (
    typeof oldVal === 'object' &&
    oldVal !== null &&
    typeof newVal === 'object' &&
    newVal !== null
  ) {
    if (
      recordsEqual(
        oldVal as Record<string, string[]>,
        newVal as Record<string, string[]>,
      )
    )
      return null;
  } else if (oldVal === newVal) {
    return null;
  }
  return { field, oldValue: oldVal, newValue: newVal };
}

// ── Generic entity diff ────────────────────────────────────────────

function diffEntityMaps<T extends Record<string, unknown>>(
  oldMap: Map<string, T>,
  newMap: Map<string, T>,
  fields: string[],
): EntityDiffRecord<T>[] {
  const results: EntityDiffRecord<T>[] = [];
  const allKeys = Array.from(new Set(Array.from(oldMap.keys()).concat(Array.from(newMap.keys()))));

  for (const key of allKeys) {
    const oldEntity = oldMap.get(key) ?? null;
    const newEntity = newMap.get(key) ?? null;

    if (oldEntity && !newEntity) {
      results.push({
        type: 'deleted',
        key,
        oldEntity,
        newEntity: null,
        changes: [],
      });
    } else if (!oldEntity && newEntity) {
      results.push({
        type: 'added',
        key,
        oldEntity: null,
        newEntity,
        changes: [],
      });
    } else if (oldEntity && newEntity) {
      const changes: FieldDelta[] = [];
      for (const field of fields) {
        const delta = compareField(field, oldEntity[field], newEntity[field]);
        if (delta) changes.push(delta);
      }
      results.push({
        type: changes.length > 0 ? 'modified' : 'unchanged',
        key,
        oldEntity,
        newEntity,
        changes,
      });
    }
  }

  return results;
}

// ── Route-specific impact analysis ─────────────────────────────────

function computeRouteImpact(
  oldRoute: MaterializedRoute,
  newRoute: MaterializedRoute,
  oldTrips: Map<string, MaterializedTrip>,
  newTrips: Map<string, MaterializedTrip>,
): RouteImpact {
  // Trip changes
  const oldTripIds = new Set(
    Object.values(oldRoute.perDirectionTrips).flat(),
  );
  const newTripIds = new Set(
    Object.values(newRoute.perDirectionTrips).flat(),
  );

  const addedTrips = Array.from(newTripIds).filter((t) => !oldTripIds.has(t));
  const removedTrips = Array.from(oldTripIds).filter((t) => !newTripIds.has(t));
  const commonTrips = Array.from(oldTripIds).filter((t) => newTripIds.has(t));

  const modifiedTrips = commonTrips.filter((tripId) => {
    const oldTrip = oldTrips.get(tripId);
    const newTrip = newTrips.get(tripId);
    if (!oldTrip || !newTrip) return false;
    return (
      !arraysEqual(oldTrip.stopSequence, newTrip.stopSequence) ||
      oldTrip.firstDepartureTime !== newTrip.firstDepartureTime ||
      oldTrip.lastArrivalTime !== newTrip.lastArrivalTime ||
      oldTrip.trip_headsign !== newTrip.trip_headsign ||
      oldTrip.direction_id !== newTrip.direction_id ||
      oldTrip.shape_id !== newTrip.shape_id
    );
  });

  // Stop changes
  const oldStopSet = new Set(oldRoute.stopUniverse);
  const newStopSet = new Set(newRoute.stopUniverse);
  const addedStops = Array.from(newStopSet).filter((s) => !oldStopSet.has(s));
  const removedStops = Array.from(oldStopSet).filter((s) => !newStopSet.has(s));

  // Shapes changed
  const shapesChanged = !arraysEqual(oldRoute.shapeIds, newRoute.shapeIds);

  // Service periods changed — compare operative dates via service IDs
  const servicePeriodsChanged = !arraysEqual(
    oldRoute.serviceIds,
    newRoute.serviceIds,
  );

  // Headway delta
  const headwayDelta =
    oldRoute.averageHeadway != null && newRoute.averageHeadway != null
      ? Math.round((newRoute.averageHeadway - oldRoute.averageHeadway) * 10) /
        10
      : null;

  return {
    addedTrips,
    removedTrips,
    modifiedTrips,
    addedStops,
    removedStops,
    shapesChanged,
    servicePeriodsChanged,
    headwayDelta,
  };
}

// ── Semantic diff entry points ─────────────────────────────────────

const ROUTE_FIELDS = [
  'agency_id',
  'route_short_name',
  'route_long_name',
  'route_type',
  'route_color',
  'route_text_color',
  'tripCount',
  'stopUniverse',
  'totalOperativeTripDays',
  'averageHeadway',
  'shapeIds',
  'serviceIds',
  'perDirectionTrips',
];

const SERVICE_PERIOD_FIELDS = [
  'operativeDates',
  'operativeDayCount',
  'dateRangeString',
  'tripIds',
  'routeIds',
];

const STOP_FIELDS = [
  'stop_name',
  'stop_lat',
  'stop_lon',
  'wheelchair_boarding',
  'parent_station',
  'routeIds',
  'tripIds',
];

export interface SemanticDiffResult {
  routes: EntityDiffRecord<MaterializedRoute>[];
  servicePeriods: EntityDiffRecord<MaterializedServicePeriod>[];
  stops: EntityDiffRecord<MaterializedStop>[];
}

/**
 * Perform a full semantic diff between two materialized feeds.
 */
export function computeSemanticDiff(
  feedA: MaterializedFeed,
  feedB: MaterializedFeed,
): SemanticDiffResult {
  // Routes diff with impact analysis
  const rawRouteDiffs = diffEntityMaps(
    feedA.routes as unknown as Map<string, Record<string, unknown>>,
    feedB.routes as unknown as Map<string, Record<string, unknown>>,
    ROUTE_FIELDS,
  ) as unknown as EntityDiffRecord<MaterializedRoute>[];

  // Add impact to modified routes
  for (const diff of rawRouteDiffs) {
    if (diff.type === 'modified' && diff.oldEntity && diff.newEntity) {
      diff.impact = computeRouteImpact(
        diff.oldEntity,
        diff.newEntity,
        feedA.trips,
        feedB.trips,
      );
    } else if (diff.type === 'added' && diff.newEntity) {
      diff.impact = {
        addedTrips: Object.values(diff.newEntity.perDirectionTrips).flat(),
        removedTrips: [],
        modifiedTrips: [],
        addedStops: [...diff.newEntity.stopUniverse],
        removedStops: [],
        shapesChanged: false,
        servicePeriodsChanged: false,
        headwayDelta: null,
      };
    } else if (diff.type === 'deleted' && diff.oldEntity) {
      diff.impact = {
        addedTrips: [],
        removedTrips: Object.values(diff.oldEntity.perDirectionTrips).flat(),
        modifiedTrips: [],
        addedStops: [],
        removedStops: [...diff.oldEntity.stopUniverse],
        shapesChanged: false,
        servicePeriodsChanged: false,
        headwayDelta: null,
      };
    }
  }

  // Service periods diff
  const servicePeriodDiffs = diffEntityMaps(
    feedA.servicePeriods as unknown as Map<string, Record<string, unknown>>,
    feedB.servicePeriods as unknown as Map<string, Record<string, unknown>>,
    SERVICE_PERIOD_FIELDS,
  ) as unknown as EntityDiffRecord<MaterializedServicePeriod>[];

  // Stops diff
  const stopDiffs = diffEntityMaps(
    feedA.stops as unknown as Map<string, Record<string, unknown>>,
    feedB.stops as unknown as Map<string, Record<string, unknown>>,
    STOP_FIELDS,
  ) as unknown as EntityDiffRecord<MaterializedStop>[];

  return {
    routes: rawRouteDiffs,
    servicePeriods: servicePeriodDiffs,
    stops: stopDiffs,
  };
}

/**
 * Count diff summary statistics.
 */
export function countDiffTypes<T>(
  diffs: EntityDiffRecord<T>[],
): Record<DiffType, number> {
  const counts: Record<DiffType, number> = {
    added: 0,
    deleted: 0,
    modified: 0,
    unchanged: 0,
  };
  for (const d of diffs) {
    counts[d.type]++;
  }
  return counts;
}
