'use client';

import { Box, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import {
  type DiffType,
  type EntityDiffRecord,
  type MaterializedRoute,
  type MaterializedServicePeriod,
  type MaterializedStop,
} from '../lib/gtfs-types';
import { countDiffTypes } from '../lib/semantic-diff';
import SummaryStatBar from './SummaryStatBar';
import EntityCard from './EntityCard';

// ── Sort: changed entities first, then alphabetical ────────────────

const SORT_ORDER: Record<DiffType, number> = {
  modified: 0,
  added: 1,
  deleted: 2,
  unchanged: 3,
};

function sortDiffs<T>(diffs: EntityDiffRecord<T>[]): EntityDiffRecord<T>[] {
  return [...diffs].sort(
    (a, b) =>
      SORT_ORDER[a.type] - SORT_ORDER[b.type] || a.key.localeCompare(b.key),
  );
}

// ── Route tab ──────────────────────────────────────────────────────

interface RoutesTabProps {
  diffs: EntityDiffRecord<MaterializedRoute>[];
  onViewFileDiff: (routeId: string) => void;
}

export function RoutesTab({
  diffs,
  onViewFileDiff,
}: RoutesTabProps): React.ReactElement {
  const [filter, setFilter] = useState<DiffType | null>(null);
  const counts = useMemo(() => countDiffTypes(diffs), [diffs]);
  const sorted = useMemo(() => sortDiffs(diffs), [diffs]);
  const filtered = filter ? sorted.filter((d) => d.type === filter) : sorted;

  return (
    <Box>
      <SummaryStatBar
        counts={counts}
        activeFilter={filter}
        onFilterClick={setFilter}
      />
      {filtered.length === 0 ? (
        <Typography sx={{ mt: 2 }} color='text.secondary'>
          No routes match the current filter.
        </Typography>
      ) : (
        <Box sx={{ mt: 2 }}>
          {filtered.map((diff) => (
            <EntityCard<MaterializedRoute>
              key={diff.key}
              diff={diff}
              renderSummary={(r) =>
                `${r.route_short_name ?? ''} ${r.route_long_name ?? ''} · ${r.tripCount} trips · ${r.stopUniverse.length} stops`
              }
              onViewFileDiff={() => onViewFileDiff(diff.key)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Service Periods tab ────────────────────────────────────────────

interface ServicePeriodsTabProps {
  diffs: EntityDiffRecord<MaterializedServicePeriod>[];
}

export function ServicePeriodsTab({
  diffs,
}: ServicePeriodsTabProps): React.ReactElement {
  const [filter, setFilter] = useState<DiffType | null>(null);
  const counts = useMemo(() => countDiffTypes(diffs), [diffs]);
  const sorted = useMemo(() => sortDiffs(diffs), [diffs]);
  const filtered = filter ? sorted.filter((d) => d.type === filter) : sorted;

  return (
    <Box>
      <SummaryStatBar
        counts={counts}
        activeFilter={filter}
        onFilterClick={setFilter}
      />
      {filtered.length === 0 ? (
        <Typography sx={{ mt: 2 }} color='text.secondary'>
          No service periods match the current filter.
        </Typography>
      ) : (
        <Box sx={{ mt: 2 }}>
          {filtered.map((diff) => (
            <EntityCard<MaterializedServicePeriod>
              key={diff.key}
              diff={diff}
              renderSummary={(s) =>
                `${s.operativeDayCount} days · ${s.dateRangeString} · ${s.tripIds.length} trips`
              }
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Stops tab ──────────────────────────────────────────────────────

interface StopsTabProps {
  diffs: EntityDiffRecord<MaterializedStop>[];
}

export function StopsTab({ diffs }: StopsTabProps): React.ReactElement {
  const [filter, setFilter] = useState<DiffType | null>(null);
  const counts = useMemo(() => countDiffTypes(diffs), [diffs]);
  const sorted = useMemo(() => sortDiffs(diffs), [diffs]);
  const filtered = filter ? sorted.filter((d) => d.type === filter) : sorted;

  return (
    <Box>
      <SummaryStatBar
        counts={counts}
        activeFilter={filter}
        onFilterClick={setFilter}
      />
      {filtered.length === 0 ? (
        <Typography sx={{ mt: 2 }} color='text.secondary'>
          No stops match the current filter.
        </Typography>
      ) : (
        <Box sx={{ mt: 2 }}>
          {filtered.map((diff) => (
            <EntityCard<MaterializedStop>
              key={diff.key}
              diff={diff}
              renderSummary={(s) =>
                `${s.stop_name ?? 'Unnamed'} · ${s.routeIds.length} routes · ${s.tripIds.length} trips`
              }
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
