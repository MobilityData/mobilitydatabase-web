'use client';

import {
  Box,
  Button,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import type { RouteDirDiff, TripPair } from '../../lib/trips-types';
import { inHourRange } from '../../lib/trips-utils';
import { isRiderChange, routeChips } from '../../lib/trips-v2-summary';
import StringlineChart from '../trips/StringlineChart';
import { ChipRow, SubHeading, V2Card, segmentedSx } from './shared';
import SelectedTripPanel from './SelectedTripPanel';
import ServiceProfileBars from './ServiceProfileBars';
import StopPatternLines from './StopPatternLines';
import TimetableGrid from './TimetableGrid';

type View = 'timetable' | 'stringline';

interface RouteDetailCardProps {
  route: RouteDirDiff;
  info: RouteInfo | undefined;
  stopNames: Record<string, string>;
  /** The day compared, for the scope tag: "Weekday · Tue 8 Sep". */
  dayLabel: string;
  onOpenTrip: (pair: TripPair) => void;
  /** Shows a close button when set. */
  onClose?: () => void;
  /** Replaces the "Route <name>" title (Trips v5: "Service"). */
  title?: React.ReactNode;
  /** Replaces the route's summary chips. */
  chips?: React.ReactNode;
  /**
   * Trips v5: no day tag, no service profile caption, and the trips in a
   * box of their own that scrolls.
   */
  compact?: boolean;
  /** Set when the dataset has a stop_times Parquet table to query. */
  rawDatasetId: string | null;
}

/**
 * Service profile → stop patterns → trips → the selected trip. Keyed by
 * route and day in the parent, so a new route starts with a fresh state.
 */
export default function RouteDetailCard({
  route,
  info,
  stopNames,
  dayLabel,
  onOpenTrip,
  onClose,
  rawDatasetId,
  title,
  chips,
  compact = false,
}: RouteDetailCardProps): React.ReactElement {
  const [range, setRange] = useState<[number, number] | null>(null);
  const [view, setView] = useState<View>('timetable');
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const pairs = useMemo(
    () => route.pairs.filter((p) => inHourRange(p, range)),
    [route.pairs, range],
  );
  const changedCount = pairs.filter(isRiderChange).length;
  // Keep the selection while it is in range; otherwise show the first change.
  // Compact (Trips v5): nothing selected; a trip opens the trip drawer.
  const selected = compact
    ? (pairs.find((p) => p.key === selectedKey) ?? null)
    : (pairs.find((p) => p.key === selectedKey) ??
      pairs.find(isRiderChange) ??
      pairs[0] ??
      null);

  const bg = info?.color ? `#${info.color}` : undefined;
  const fg = info?.text_color ? `#${info.text_color}` : undefined;
  const label = info?.short_name || route.route;

  return (
    <V2Card
      title={
        title ?? (
          <Box
            component='span'
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}
          >
            <Box
              component='span'
              sx={{
                px: 1,
                minWidth: 32,
                textAlign: 'center',
                borderRadius: '4px',
                bgcolor: bg ?? 'primary.main',
                color: fg ?? 'primary.contrastText',
                fontSize: '0.9rem',
                lineHeight: '28px',
              }}
            >
              {label}
            </Box>
            <span>
              Route {label} · {route.headsign || info?.long_name || route.route}
            </span>
          </Box>
        )
      }
      scope={compact ? undefined : dayLabel}
      actions={
        onClose ? (
          <IconButton size='small' aria-label='Close route' onClick={onClose}>
            <Close fontSize='small' />
          </IconButton>
        ) : undefined
      }
    >
      <Box sx={{ mb: 3 }}>{chips ?? <ChipRow chips={routeChips(route)} />}</Box>

      <Box sx={{ mb: 3 }}>
        <ServiceProfileBars
          route={route}
          range={range}
          onRangeChange={setRange}
          caption={!compact}
          axisLabels={compact}
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <StopPatternLines route={route} stopNames={stopNames} />
      </Box>

      <SubHeading
        title='Trips'
        caption={
          compact
            ? undefined
            : `${pairs.length} trip${pairs.length === 1 ? '' : 's'} start ${range ? 'in the selected period' : 'in the day'}, ${changedCount} with changes. Select a trip for its detail.`
        }
        actions={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <ToggleButtonGroup
              size='small'
              exclusive
              value={view}
              onChange={(_, v: View | null) => v && setView(v)}
              aria-label='Trips view'
            >
              <ToggleButton value='timetable' sx={segmentedSx}>
                Timetable
              </ToggleButton>
              <ToggleButton value='stringline' sx={segmentedSx}>
                Stringline
              </ToggleButton>
            </ToggleButtonGroup>
            {view === 'timetable' && !compact ? (
              <Button
                size='small'
                variant='outlined'
                color='inherit'
                onClick={() => setShowUnchanged((v) => !v)}
                sx={{ textTransform: 'none', borderColor: 'divider' }}
              >
                {showUnchanged
                  ? 'Fold unchanged trips'
                  : 'Show unchanged trips'}
              </Button>
            ) : null}
          </Box>
        }
      />
      <Box
        sx={
          compact
            ? {
                overflow: 'hidden',
                border: 1,
                borderColor: 'divider',
                borderRadius: '6px',
              }
            : undefined
        }
      >
        {view === 'timetable' ? (
          <TimetableGrid
            route={route}
            pairs={pairs}
            stopNames={stopNames}
            selectedKey={selected?.key ?? null}
            onSelect={(p) => (compact ? onOpenTrip(p) : setSelectedKey(p.key))}
            showUnchanged={showUnchanged}
            hoverColumns={compact}
            maxHeight={compact ? 560 : undefined}
          />
        ) : (
          <StringlineChart
            route={route}
            pairs={pairs}
            stopNames={stopNames}
            range={range}
            onOpenTrip={(p) =>
              compact ? onOpenTrip(p) : setSelectedKey(p.key)
            }
          />
        )}
      </Box>
      {!compact && selected ? (
        <SelectedTripPanel
          pair={selected}
          stopNames={stopNames}
          onOpenDetails={() => onOpenTrip(selected)}
          rawDatasetId={rawDatasetId}
        />
      ) : null}
    </V2Card>
  );
}
