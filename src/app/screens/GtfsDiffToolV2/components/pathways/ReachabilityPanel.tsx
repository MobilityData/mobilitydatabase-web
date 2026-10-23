'use client';

import {
  Box,
  ButtonBase,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import React from 'react';
import {
  type CellSide,
  type MatrixCell,
  type NodeLabel,
  type Route,
  type RouteMode,
  type Side,
  type StationAnalysis,
  TIME_ASSUMPTIONS,
  endpointsText,
  explainCell,
  formatDelta,
  formatDuration,
  linkTitle,
} from '../../lib/pathways-utils';
import {
  CHANGE_LABELS,
  CHANGE_SEVERITY,
  MONO_FONT,
  Section,
  StatusBadge,
  TONES,
} from './shared';

export function cellKey(c: Pick<MatrixCell, 'entrance' | 'platform'>): string {
  return `${c.entrance}|${c.platform}`;
}

const CHANGE_RANK: Record<MatrixCell['change'], number> = {
  lost: 0,
  gained: 1,
  slower: 2,
  faster: 3,
  unchanged: 4,
  none: 5,
};

/** The cell to show when nothing is selected: the most notable change. */
export function defaultCell(cells: MatrixCell[]): MatrixCell | undefined {
  return cells.reduce<MatrixCell | undefined>(
    (best, c) =>
      best == null || CHANGE_RANK[c.change] < CHANGE_RANK[best.change]
        ? c
        : best,
    undefined,
  );
}

function routeTime(route: Route): string {
  return `${route.estimated ? '~' : ''}${formatDuration(route.seconds)}`;
}

function headline(side: CellSide, mode: RouteMode): string {
  if (mode === 'step_free')
    return side.route ? 'Step-free' : 'No step-free route';
  return side.route ? 'Reachable' : 'Not reachable';
}

function beforeText(side: CellSide, mode: RouteMode): string {
  if (side.missing) return 'Before: not in feed';
  if (side.route == null)
    return `Before: ${mode === 'step_free' ? 'no step-free route' : 'not reachable'}`;
  return `Before: ${mode === 'step_free' ? 'step-free, ' : ''}${routeTime(side.route)}`;
}

interface CellButtonProps {
  cell: MatrixCell;
  mode: RouteMode;
  selected: boolean;
  onSelect: (key: string) => void;
}

function CellButton({
  cell,
  mode,
  selected,
  onSelect,
}: CellButtonProps): React.ReactElement {
  const severity = CHANGE_SEVERITY[cell.change];
  const tone = TONES[severity];
  const chip =
    cell.change === 'slower' || cell.change === 'faster'
      ? `${CHANGE_LABELS[cell.change]} ${formatDelta(cell.deltaS ?? 0)}`
      : CHANGE_LABELS[cell.change];
  return (
    <ButtonBase
      onClick={() => onSelect(cellKey(cell))}
      aria-pressed={selected}
      sx={{
        display: 'block',
        textAlign: 'left',
        width: '100%',
        height: '100%',
        p: 1.25,
        borderRadius: '4px',
        bgcolor: tone.bg,
        border: '1px solid',
        borderColor: tone.border,
        outline: selected ? '2px solid' : 'none',
        outlineColor: 'text.primary',
        outlineOffset: '1px',
      }}
    >
      <StatusBadge label={chip} severity={severity} />
      <Typography variant='body2' fontWeight={700} sx={{ mt: 0.75 }}>
        {headline(cell.new, mode)}
      </Typography>
      {cell.new.route ? (
        <Typography
          variant='caption'
          component='div'
          sx={{ fontFamily: MONO_FONT }}
        >
          {routeTime(cell.new.route)}
        </Typography>
      ) : null}
      {cell.change !== 'unchanged' ? (
        <Typography variant='caption' component='div' color='text.secondary'>
          {beforeText(cell.base, mode)}
        </Typography>
      ) : null}
    </ButtonBase>
  );
}

interface RouteStepsProps {
  title: string;
  side: Side;
  data: CellSide;
  mode: RouteMode;
  labels: Map<string, NodeLabel>;
}

function RouteSteps({
  title,
  side,
  data,
  mode,
  labels,
}: RouteStepsProps): React.ReactElement {
  const route = data.route;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          mb: 1,
        }}
      >
        <Typography variant='subtitle2' fontWeight={700}>
          {title}
        </Typography>
        <Typography variant='caption' sx={{ fontFamily: MONO_FONT }}>
          {route ? routeTime(route) : 'None'}
        </Typography>
      </Box>
      {route == null ? (
        <Box sx={{ bgcolor: 'background.paper', borderRadius: '4px', p: 1.25 }}>
          <Typography variant='body2'>
            {data.missing
              ? 'Not in this feed'
              : mode === 'step_free'
                ? 'No step-free route'
                : 'No route'}
          </Typography>
          {data.blocked ? (
            <Typography variant='caption' color='text.secondary'>
              {data.blocked}
            </Typography>
          ) : null}
        </Box>
      ) : (
        <Box
          component='ol'
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}
        >
          {route.steps.map((s, i) => {
            const removed = side === 'base' && s.link.status === 'deleted';
            const added = side === 'new' && s.link.status === 'added';
            const changed = s.link.status === 'modified';
            return (
              <Box
                component='li'
                key={`${s.pathwayId}-${i}`}
                sx={{
                  bgcolor: 'background.paper',
                  borderRadius: '4px',
                  p: 1.25,
                  border: '1px solid',
                  borderColor: removed
                    ? TONES.error.border
                    : added
                      ? TONES.success.border
                      : 'transparent',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  <Typography variant='body2' fontWeight={700}>
                    {linkTitle(s.link)}
                  </Typography>
                  <Tooltip
                    title={
                      s.estimated
                        ? `Estimated: no traversal_time in the feed (walking ${TIME_ASSUMPTIONS.walkMps} m/s, ${TIME_ASSUMPTIONS.stairStepS} s per stair)`
                        : 'traversal_time from the feed'
                    }
                  >
                    <Typography
                      variant='caption'
                      sx={{ fontFamily: MONO_FONT, whiteSpace: 'nowrap' }}
                    >
                      {s.estimated ? '~' : ''}
                      {formatDuration(s.seconds)}
                    </Typography>
                  </Tooltip>
                </Box>
                <Typography
                  variant='caption'
                  color='text.secondary'
                  component='div'
                >
                  {endpointsText(s.from, s.to, labels)}
                </Typography>
                {removed || added || changed ? (
                  <Box sx={{ mt: 0.5 }}>
                    <StatusBadge
                      label={
                        removed
                          ? 'Removed in new feed'
                          : added
                            ? 'Added in new feed'
                            : 'Changed'
                      }
                      severity={
                        removed ? 'error' : added ? 'success' : 'warning'
                      }
                    />
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

interface ReachabilityPanelProps {
  analysis: StationAnalysis;
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  selected: MatrixCell | undefined;
  onSelect: (key: string) => void;
}

export default function ReachabilityPanel({
  analysis,
  mode,
  onModeChange,
  selected,
  onSelect,
}: ReachabilityPanelProps): React.ReactElement {
  const { labels } = analysis;
  const matrix = analysis.matrices[mode];
  const cellByKey = new Map(matrix.cells.map((c) => [cellKey(c), c]));
  const explanation = selected ? explainCell(selected, mode, labels) : null;
  const title = (id: string): string => labels.get(id)?.title ?? id;

  const toggle = (
    <ToggleButtonGroup
      exclusive
      size='small'
      value={mode}
      onChange={(_, v: RouteMode | null) => {
        if (v != null) onModeChange(v);
      }}
    >
      <ToggleButton value='step_free' sx={{ textTransform: 'none', px: 2 }}>
        Step-free route
      </ToggleButton>
      <ToggleButton value='fastest' sx={{ textTransform: 'none', px: 2 }}>
        Fastest route
      </ToggleButton>
    </ToggleButtonGroup>
  );

  if (matrix.entrances.length === 0 || matrix.platforms.length === 0) {
    return (
      <Section title='Can riders still reach each platform?' action={toggle}>
        <Typography color='text.secondary'>
          This station has no{' '}
          {matrix.entrances.length === 0
            ? 'entrances (location_type 2)'
            : 'platforms'}{' '}
          in its pathway graph, so entrance-to-platform routes can&apos;t be
          compared.
        </Typography>
      </Section>
    );
  }

  return (
    <Section
      title='Can riders still reach each platform?'
      description='Each cell compares the route from an entrance to a platform. Select a cell to see the route step by step.'
      action={toggle}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'minmax(0, 1fr) minmax(0, 1fr)',
          },
          gap: 2.5,
          alignItems: 'start',
        }}
      >
        {/* Matrix */}
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            role='grid'
            sx={{
              display: 'grid',
              gridTemplateColumns: `minmax(100px, auto) repeat(${matrix.platforms.length}, minmax(150px, 1fr))`,
              gap: 1,
              alignItems: 'stretch',
            }}
          >
            <Box />
            {matrix.platforms.map((p) => (
              <Box key={p} sx={{ px: 0.5 }}>
                <Typography variant='caption' fontWeight={700} component='div'>
                  {title(p)}
                </Typography>
                <Typography
                  variant='caption'
                  color='text.secondary'
                  sx={{ fontFamily: MONO_FONT }}
                >
                  {labels.get(p)?.subtitle}
                </Typography>
              </Box>
            ))}
            {matrix.entrances.map((e) => (
              <React.Fragment key={e}>
                <Box sx={{ alignSelf: 'center', pr: 1 }}>
                  <Typography variant='body2' fontWeight={700}>
                    {title(e)}
                  </Typography>
                  <Typography
                    variant='caption'
                    color='text.secondary'
                    sx={{ fontFamily: MONO_FONT, wordBreak: 'break-all' }}
                  >
                    {e}
                  </Typography>
                </Box>
                {matrix.platforms.map((p) => {
                  const cell = cellByKey.get(`${e}|${p}`);
                  return cell ? (
                    <CellButton
                      key={p}
                      cell={cell}
                      mode={mode}
                      selected={
                        selected != null && cellKey(selected) === cellKey(cell)
                      }
                      onSelect={onSelect}
                    />
                  ) : (
                    <Box key={p} />
                  );
                })}
              </React.Fragment>
            ))}
          </Box>
        </Box>

        {/* Selected route */}
        {selected ? (
          <Box sx={{ bgcolor: 'action.hover', borderRadius: '6px', p: 2 }}>
            <Typography variant='caption' color='text.secondary'>
              {mode === 'step_free' ? 'Step-free route' : 'Fastest route'}
            </Typography>
            <Typography variant='h6' fontWeight={700} sx={{ mb: 1.5 }}>
              {title(selected.entrance)} to {title(selected.platform)}
            </Typography>
            {explanation && explanation.severity !== 'neutral' ? (
              <Box
                sx={{
                  bgcolor: TONES[explanation.severity].bg,
                  border: '1px solid',
                  borderColor: TONES[explanation.severity].border,
                  borderRadius: '4px',
                  p: 1.25,
                  mb: 2,
                }}
              >
                <Typography variant='body2'>{explanation.text}</Typography>
              </Box>
            ) : explanation ? (
              <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
                {explanation.text}
              </Typography>
            ) : null}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <RouteSteps
                title='Before'
                side='base'
                data={selected.base}
                mode={mode}
                labels={labels}
              />
              <RouteSteps
                title='After'
                side='new'
                data={selected.new}
                mode={mode}
                labels={labels}
              />
            </Box>
          </Box>
        ) : null}
      </Box>
    </Section>
  );
}

/** Link ids on the selected route in each feed, for the schematic. */
export function routeLinkIds(cell: MatrixCell | undefined): Set<string> {
  const ids = new Set<string>();
  for (const r of [cell?.base.route, cell?.new.route]) {
    for (const s of r?.steps ?? []) ids.add(s.link.id);
  }
  return ids;
}
