'use client';

import {
  Box,
  ButtonBase,
  IconButton,
  Link,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  EditNoteOutlined,
  InfoOutlined,
  PlaceOutlined,
  Timeline,
} from '@mui/icons-material';
import React, { useId, useState } from 'react';
import type {
  RouteDetail,
  RouteInfo,
  RouteStopInfo,
  RoutesMapDiff,
} from '../../lib/entity-diff-types';
import { routeKind } from '../../lib/routes-utils';
import { routeChanges } from '../../lib/routes-v2';
import {
  DIRECTION_STOP_COLORS,
  DIRECTION_STOP_LABELS,
  type DirectionStopRelation,
  type DirectionSummary,
  directionShapes,
  directionSummaries,
  stopCountLabel,
  stopsForDirection,
} from '../../lib/routes-v2-directions';
import { formatDistance } from '../../lib/stops-utils';
import { MONO_FONT } from '../calendar/shared';
import { Link as IntlLink } from '../../../../../i18n/navigation';
import RouteShapes, { shapesPathSummary } from '../routes/RouteShapes';
import { RouteBadge } from './RouteBadge';
import { ChangeChips, ChangePill } from './ChangeChips';

/** Explanations live in a tooltip on the section title, not in the panel. */
export function InfoTip({
  label,
  title,
}: {
  label: string;
  title: React.ReactNode;
}): React.ReactElement {
  return (
    <Tooltip title={title}>
      <IconButton size='small' aria-label={label} sx={{ p: 0.25, ml: 0.25 }}>
        <InfoOutlined sx={{ fontSize: '0.95rem' }} />
      </IconButton>
    </Tooltip>
  );
}

function SectionTitle({
  children,
  icon: Icon,
  info,
}: {
  children: string;
  /** Shown left of the title. */
  icon: typeof InfoOutlined;
  info?: React.ReactNode;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
      <Icon aria-hidden sx={{ fontSize: '1.1rem', color: 'text.secondary' }} />
      <Typography
        variant='overline'
        component='h3'
        sx={{ fontWeight: 700, lineHeight: 1.6, color: 'text.secondary' }}
      >
        {children}
      </Typography>
      {info ? <InfoTip label={`About ${children}`} title={info} /> : null}
    </Box>
  );
}

/** The link under a section to the matching entity page. */
const SECTION_LINK_SX = {
  display: 'inline-block',
  mt: 1,
  fontWeight: 600,
  textAlign: 'left',
} as const;

const PATH_COLOR = '#ed6c02';

// ── Direction cards ────────────────────────────────────────────────

function DirectionCard({
  title,
  note,
  chips,
  selected,
  onClick,
  wide = false,
}: {
  title: string;
  note?: string | null;
  chips: Array<{ label: string; color?: string }>;
  selected: boolean;
  onClick: () => void;
  /** Spans both columns. */
  wide?: boolean;
}): React.ReactElement {
  return (
    <ButtonBase
      aria-pressed={selected}
      onClick={onClick}
      sx={{
        gridColumn: wide ? '1 / -1' : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 0.5,
        px: 1,
        py: 0.75,
        textAlign: 'left',
        borderRadius: '6px',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
        '&.Mui-focusVisible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 1,
        },
      }}
    >
      <Typography
        component='span'
        variant='body2'
        sx={{ fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}
      >
        {title}
      </Typography>
      {note ? (
        <Typography
          component='span'
          variant='caption'
          color='text.secondary'
          sx={{ lineHeight: 1.3, overflowWrap: 'anywhere' }}
        >
          {note}
        </Typography>
      ) : null}
      {chips.length > 0 ? (
        <Box
          component='span'
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
        >
          {chips.map((c) => (
            <ChangePill
              key={c.label}
              component='span'
              label={c.label}
              color={c.color}
            />
          ))}
        </Box>
      ) : null}
    </ButtonBase>
  );
}

function directionChips(
  s: Pick<DirectionSummary, 'added' | 'removed' | 'moved'> &
    Partial<Pick<DirectionSummary, 'presence' | 'pathChanged'>>,
): Array<{ label: string; color?: string }> {
  const chips: Array<{ label: string; color?: string }> = [];
  if (s.presence === 'added')
    chips.push({ label: 'Added', color: DIRECTION_STOP_COLORS.added });
  else if (s.presence === 'removed')
    chips.push({ label: 'Removed', color: DIRECTION_STOP_COLORS.removed });
  if (s.pathChanged) chips.push({ label: 'Path changed', color: PATH_COLOR });
  const stops = stopCountLabel(s.added, s.removed);
  if (stops) chips.push({ label: stops, color: PATH_COLOR });
  if (s.moved > 0)
    chips.push({
      label: `${s.moved} moved`,
      color: DIRECTION_STOP_COLORS.moved,
    });
  return chips;
}

/** "All directions", then one card per direction with its changes. */
function DirectionCards({
  route,
  thresholdM,
  value,
  onChange,
}: {
  route: RouteDetail;
  thresholdM: number;
  value: string | null;
  onChange: (dir: string | null) => void;
}): React.ReactElement {
  const summaries = directionSummaries(route, thresholdM);
  const all = stopsForDirection(route, null);
  return (
    <Box
      role='group'
      aria-label='Direction'
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 0.75,
      }}
    >
      <DirectionCard
        wide
        title='All directions'
        chips={directionChips({
          added: all.added.length,
          removed: all.removed.length,
          moved: all.moved.length,
        })}
        selected={value == null}
        onClick={() => onChange(null)}
      />
      {summaries.map((s) => (
        <DirectionCard
          key={s.direction_id}
          title={s.label}
          note={s.headsignWas ? `Headsign was ${s.headsignWas}` : null}
          chips={directionChips(s)}
          selected={value === s.direction_id}
          onClick={() => onChange(s.direction_id)}
        />
      ))}
    </Box>
  );
}

// ── Stop changes ───────────────────────────────────────────────────

/** Lists longer than this show their first stops and a "Show all" toggle. */
const STOP_LIST_COLLAPSED = 5;

const LIST_TITLES: Record<DirectionStopRelation, string> = {
  added: 'Added',
  removed: 'Removed',
  moved: 'Moved',
};

function StopList({
  relation,
  ids,
  info,
  onHoverStop,
}: {
  relation: DirectionStopRelation;
  ids: string[];
  info: Record<string, RouteStopInfo>;
  onHoverStop: (stopId: string | null) => void;
}): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (ids.length === 0) return null;
  const long = ids.length > STOP_LIST_COLLAPSED;
  const shown = long && !expanded ? ids.slice(0, STOP_LIST_COLLAPSED) : ids;
  const color = DIRECTION_STOP_COLORS[relation];
  return (
    <Box>
      <Typography
        component='h4'
        variant='body2'
        sx={{ fontWeight: 700, color, mb: 0.25 }}
      >
        {LIST_TITLES[relation]} ({ids.length.toLocaleString()})
      </Typography>
      <Box
        component='ul'
        id={listId}
        aria-label={`${DIRECTION_STOP_LABELS[relation]} stops`}
        onMouseLeave={() => onHoverStop(null)}
        sx={{ listStyle: 'none', m: 0, p: 0 }}
      >
        {shown.map((id) => {
          const s = info[id];
          return (
            <Box
              component='li'
              key={id}
              onMouseEnter={() => onHoverStop(id)}
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
                px: 0.5,
                py: 0.25,
                borderRadius: '4px',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  borderRadius: '50%',
                  bgcolor: color,
                  alignSelf: 'center',
                }}
              />
              <Typography
                variant='body2'
                sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
              >
                {s?.name || id}
                {s?.name ? (
                  <Box
                    component='span'
                    sx={{
                      ml: 0.75,
                      fontFamily: MONO_FONT,
                      fontSize: '0.7rem',
                      color: 'text.secondary',
                    }}
                  >
                    {id}
                  </Box>
                ) : null}
              </Typography>
              {relation === 'moved' ? (
                <Typography
                  variant='caption'
                  color='text.secondary'
                  sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatDistance(s?.moved_m ?? null)}
                </Typography>
              ) : null}
            </Box>
          );
        })}
      </Box>
      {long ? (
        <Link
          component='button'
          type='button'
          variant='caption'
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((e) => !e)}
          sx={{ ml: 0.5, fontWeight: 600 }}
        >
          {expanded ? 'Show fewer' : `Show all ${ids.length.toLocaleString()}`}
        </Link>
      ) : null}
    </Box>
  );
}

/** The selected direction's added, removed and moved stops. */
function StopChanges({
  route,
  directionId,
  multiDirection,
  onHoverStop,
}: {
  route: RouteDetail;
  directionId: string | null;
  multiDirection: boolean;
  onHoverStop: (stopId: string | null) => void;
}): React.ReactElement {
  const stops = stopsForDirection(route, directionId);
  const total = stops.added.length + stops.removed.length + stops.moved.length;
  const scope =
    directionId == null && multiDirection ? 'route' : 'this direction';
  return (
    <Box component='section'>
      <SectionTitle
        icon={PlaceOutlined}
        info={
          directionId == null && multiDirection
            ? 'Stops added to, removed from or moved on any direction of the route. Hover a stop to find it on the map.'
            : 'Stops this direction serves only in the new feed (added) or only in the original one (removed), and stops served in both that moved. Hover a stop to find it on the map.'
        }
      >
        Stop changes
      </SectionTitle>
      {total === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          {scope === 'route'
            ? 'No stop changes on this route.'
            : 'No stop changes in this direction.'}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(['added', 'removed', 'moved'] as const).map((rel) => (
            <StopList
              // Collapse again when the direction changes.
              key={`${rel}|${directionId ?? ''}`}
              relation={rel}
              ids={stops[rel]}
              info={route.stop_info}
              onHoverStop={onHoverStop}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

interface RouteDetailV2Props {
  route: RouteDetail;
  routesMap: RoutesMapDiff;
  routeInfo: Record<string, RouteInfo>;
  headingRef: React.Ref<HTMLHeadingElement>;
  onHoverStop: (stopId: string | null) => void;
  selectedShapeId: string | null;
  onSelectShape: (shapeId: string | null) => void;
  /** The selected direction's id; null for all directions. */
  directionId: string | null;
  onSelectDirection: (directionId: string | null) => void;
  /** This route on the Service Dates page. */
  onOpenCalendar: () => void;
  /** This route's page in the Trips entity. */
  tripsHref: string;
  /** Show this route's routes.txt row in the raw file diff. */
  onSeeFieldChanges: () => void;
}

/**
 * One route, top to bottom: header, direction cards, fields, shapes and
 * stop changes (of the selected direction), then links to its trips and
 * service dates (which those pages report, not this one).
 */
export default function RouteDetailV2({
  route: r,
  routesMap,
  routeInfo,
  headingRef,
  onHoverStop,
  selectedShapeId,
  onSelectShape,
  directionId,
  onSelectDirection,
  onOpenCalendar,
  tripsHref,
  onSeeFieldChanges,
}: RouteDetailV2Props): React.ReactElement {
  const kind = routeKind(r);
  const thresholdM = routesMap.path_change_threshold_m;
  const multiDirection = r.directions.length > 1;
  const shapes = r.shapes
    ? directionShapes(r.shapes, r.directions, directionId)
    : null;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.75 }}>
      <Box component='header'>
        {/* Like a list row: badge and changes, then the name. */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
            mb: 0.75,
          }}
        >
          <RouteBadge
            label={r.short_name || r.route_id}
            color={r.color}
            textColor={r.text_color}
            removed={kind === 'removed'}
            maxWidth={200}
          />
          <Box sx={{ minWidth: 0, '& ul': { justifyContent: 'flex-end' } }}>
            <ChangeChips changes={routeChanges(kind, r.flags)} />
          </Box>
        </Box>
        <Typography
          ref={headingRef}
          tabIndex={-1}
          component='h2'
          variant='subtitle1'
          sx={{
            fontWeight: 700,
            lineHeight: 1.3,
            overflowWrap: 'anywhere',
            outline: 'none',
          }}
        >
          {r.long_name || r.short_name || r.route_id}
        </Typography>
        {multiDirection ? (
          <Box sx={{ mt: 1.5 }}>
            <DirectionCards
              route={r}
              thresholdM={thresholdM}
              value={directionId}
              onChange={onSelectDirection}
            />
          </Box>
        ) : null}
      </Box>

      {r.field_changes.length > 0 ? (
        <Box component='section'>
          <SectionTitle icon={EditNoteOutlined}>
            Modified attributes
          </SectionTitle>
          <Box
            component='ul'
            aria-label='Changed attributes'
            sx={{ m: 0, pl: 2.5, fontSize: '0.875rem' }}
          >
            {r.field_changes.map((c) => (
              <Box
                component='li'
                key={c.field}
                sx={{ fontFamily: MONO_FONT, overflowWrap: 'anywhere' }}
              >
                {c.field}
              </Box>
            ))}
          </Box>
          <Link
            component='button'
            type='button'
            variant='body2'
            color='secondary'
            underline='hover'
            onClick={onSeeFieldChanges}
            sx={{ ...SECTION_LINK_SX, display: 'block' }}
          >
            See full change →
          </Link>
        </Box>
      ) : null}

      {shapes ? (
        <Box component='section'>
          <SectionTitle
            icon={Timeline}
            info={`${shapesPathSummary(r, shapes, thresholdM)}${directionId == null ? '' : ' in this direction'}. Select a shape to draw it on the map.`}
          >
            {`Shapes (${shapes.length})`}
          </SectionTitle>
          {shapes.length === 0 && directionId != null ? (
            <Typography variant='body2' color='text.secondary'>
              No shape in this direction.
            </Typography>
          ) : (
            <RouteShapes
              compact
              route={r}
              shapes={shapes}
              routeInfo={routeInfo}
              thresholdM={thresholdM}
              sameM={routesMap.shape_same_m ?? 2}
              selectedShapeId={selectedShapeId}
              onSelectShape={onSelectShape}
            />
          )}
        </Box>
      ) : null}
      <StopChanges
        route={r}
        directionId={directionId}
        multiDirection={multiDirection}
        onHoverStop={onHoverStop}
      />
      <Box
        component='nav'
        aria-label='This route elsewhere'
        sx={{ display: 'flex', flexDirection: 'column', mb: 2 }}
      >
        <Link
          component={IntlLink}
          href={tripsHref}
          variant='body2'
          color='secondary'
          underline='hover'
          sx={{ ...SECTION_LINK_SX, mt: 0 }}
        >
          View Trips for this route
        </Link>
        <Link
          component='button'
          type='button'
          variant='body2'
          color='secondary'
          underline='hover'
          onClick={onOpenCalendar}
          sx={SECTION_LINK_SX}
        >
          View Service Dates for this route
        </Link>
      </Box>
    </Box>
  );
}
