'use client';

import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItem,
  ListSubheader,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CalendarMonthOutlined,
  Close,
  DirectionsBusOutlined,
  EditNoteOutlined,
  ExpandLess,
  ExpandMore,
  InfoOutlined,
  PlaceOutlined,
  Search,
  Timeline,
} from '@mui/icons-material';
import React, { useState } from 'react';
import type {
  RouteDetail,
  RouteDirectionDiff,
  RouteInfo,
  RouteStopInfo,
  RoutesMapDiff,
} from '../../lib/entity-diff-types';
import { routeKind } from '../../lib/routes-utils';
import {
  type ServiceGroupKey,
  TYPICAL_DAYS,
  routeChanges,
  serviceGroups,
  stopStripRows,
} from '../../lib/routes-v2';
import { formatGtfsDate } from '../../lib/calendar-utils';
import { serviceStatusQuery } from '../../lib/calendar-query';
import { useMapTableQuery } from '../../lib/useMapTable';
import { MONO_FONT, ServiceIdLink } from '../calendar/shared';
import { Link as IntlLink } from '../../../../../i18n/navigation';
import RouteShapes, { shapesPathSummary } from '../routes/RouteShapes';
import { RouteBadge } from './RouteBadge';
import { ChangeChips } from './ChangeChips';

const ADDED = '#2e7d32';
const REMOVED = '#d32f2f';

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

function delta(base: number, next: number): React.ReactElement | null {
  const d = next - base;
  if (d === 0) return null;
  return (
    <Box
      component='span'
      sx={{ color: d > 0 ? ADDED : REMOVED, fontWeight: 700, ml: 0.75 }}
    >
      {d > 0 ? `+${d}` : `−${-d}`}
    </Box>
  );
}

function windowText(
  w: { start: string; end: string } | null | undefined,
): string {
  return w ? `${formatGtfsDate(w.start)} – ${formatGtfsDate(w.end)}` : 'none';
}

function TypicalTrips({
  route,
  serviceWindow,
  tripsHref,
}: {
  route: RouteDetail;
  serviceWindow: RoutesMapDiff['service_window'];
  /** This route's page in the Trips entity. */
  tripsHref: string;
}): React.ReactElement {
  const t = route.typical_trips;
  const specialOnly =
    t != null &&
    route.trips.base + route.trips.new > 0 &&
    TYPICAL_DAYS.every(({ day }) => t[day].base + t[day].new === 0);
  const info = (
    <>
      {specialOnly ? (
        <>
          No trips on a typical day: this route only runs on special dates.
          <br />
        </>
      ) : null}
      Most common count over the dates of each day type in each feed&apos;s
      service window (before: {windowText(serviceWindow?.base)}; after:{' '}
      {windowText(serviceWindow?.new)}).
      <br />
      trips.txt: {route.trips.base.toLocaleString()} →{' '}
      {route.trips.new.toLocaleString()} trips, all service days together.
    </>
  );
  return (
    <Box component='section'>
      <SectionTitle icon={DirectionsBusOutlined} info={info}>
        Trips per typical day
      </SectionTitle>
      {t == null ? (
        <Typography variant='body2' color='text.secondary'>
          Rebuild this dataset to see trips per day.
        </Typography>
      ) : (
        <Box
          component='dl'
          sx={{
            m: 0,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 2,
            rowGap: 0.25,
            fontSize: '0.875rem',
          }}
        >
          {TYPICAL_DAYS.map(({ day, label }) => (
            <React.Fragment key={day}>
              <Box component='dt' sx={{ color: 'text.secondary' }}>
                {label}
              </Box>
              <Box
                component='dd'
                sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}
              >
                {t[day].base.toLocaleString()} → {t[day].new.toLocaleString()}
                {delta(t[day].base, t[day].new)}
              </Box>
            </React.Fragment>
          ))}
        </Box>
      )}
      <Link
        component={IntlLink}
        href={tripsHref}
        variant='body2'
        color='secondary'
        underline='hover'
        sx={SECTION_LINK_SX}
      >
        Open in Trips →
      </Link>
    </Box>
  );
}

const OP_SIGN = { keep: '', add: '+', remove: '−' } as const;
const OP_COLOR = {
  keep: 'text.primary',
  add: ADDED,
  remove: REMOVED,
} as const;

function directionLabel(d: RouteDirectionDiff): string {
  const headsign = d.headsign.new ?? d.headsign.base;
  return headsign
    ? `${d.direction_id || '—'} → ${headsign}`
    : `Direction ${d.direction_id || '—'}`;
}

/** A direction's main stop sequence as a vertical strip, unchanged runs collapsed. */
function StopStrip({
  direction,
  stops,
  railColor,
  onHoverStop,
}: {
  direction: RouteDirectionDiff;
  stops: Record<string, RouteStopInfo>;
  railColor: string;
  onHoverStop: (stopId: string | null) => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const rows = stopStripRows(direction.pattern_diff, expanded);
  if (rows.length === 0)
    return (
      <Typography variant='body2' color='text.secondary'>
        No stops in this direction.
      </Typography>
    );
  return (
    <Box
      component='ol'
      aria-label={`Stops, ${directionLabel(direction)}`}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        maxHeight: 260,
        overflowY: 'auto',
      }}
      onMouseLeave={() => onHoverStop(null)}
    >
      {rows.map((row) => {
        const rail = (
          <Box
            aria-hidden
            sx={{
              position: 'relative',
              width: 16,
              flexShrink: 0,
              alignSelf: 'stretch',
              '&::before': {
                content: '""',
                position: 'absolute',
                left: 7,
                top: 0,
                bottom: 0,
                borderLeft: `2px ${row.type === 'gap' ? 'dotted' : 'solid'} ${railColor}`,
              },
            }}
          >
            {row.type === 'stop' ? (
              <Box
                sx={{
                  position: 'absolute',
                  left: 3,
                  top: 'calc(50% - 5px)',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor:
                    row.op.op === 'keep'
                      ? 'background.paper'
                      : OP_COLOR[row.op.op],
                  border: `2px solid ${row.op.op === 'keep' ? railColor : '#ffffff'}`,
                }}
              />
            ) : null}
          </Box>
        );
        if (row.type === 'gap')
          return (
            <Box
              component='li'
              key={`gap-${row.from}`}
              sx={{ display: 'flex', gap: 1, minHeight: 26 }}
            >
              {rail}
              <Link
                component='button'
                type='button'
                variant='caption'
                onClick={() => setExpanded((s) => new Set([...s, row.from]))}
                sx={{ alignSelf: 'center' }}
              >
                ⋯ {row.count} unchanged stop{row.count === 1 ? '' : 's'}
              </Link>
            </Box>
          );
        const { op } = row;
        const name = stops[op.stop_id]?.name || op.stop_id;
        return (
          <Box
            component='li'
            key={`${row.index}-${op.stop_id}`}
            onMouseEnter={() => onHoverStop(op.stop_id)}
            sx={{
              display: 'flex',
              gap: 1,
              minHeight: 26,
              borderRadius: '4px',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {rail}
            <Box
              aria-hidden
              sx={{
                width: 10,
                flexShrink: 0,
                alignSelf: 'center',
                fontFamily: MONO_FONT,
                fontWeight: 700,
                color: OP_COLOR[op.op],
              }}
            >
              {OP_SIGN[op.op]}
            </Box>
            <Typography
              variant='body2'
              sx={{
                alignSelf: 'center',
                py: 0.25,
                minWidth: 0,
                color: OP_COLOR[op.op],
                textDecoration: op.op === 'remove' ? 'line-through' : undefined,
                overflowWrap: 'anywhere',
              }}
            >
              {op.op === 'add' ? (
                <Box component='span' sx={visuallyHidden}>
                  Added:{' '}
                </Box>
              ) : op.op === 'remove' ? (
                <Box component='span' sx={visuallyHidden}>
                  Removed:{' '}
                </Box>
              ) : null}
              {name}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

function StopsPerDirection({
  route,
  railColor,
  onHoverStop,
}: {
  route: RouteDetail;
  railColor: string;
  onHoverStop: (stopId: string | null) => void;
}): React.ReactElement {
  const [dir, setDir] = useState(0);
  const d = route.directions[Math.min(dir, route.directions.length - 1)];
  const inMain = new Set(
    route.directions.flatMap((x) => x.pattern_diff.map((o) => o.stop_id)),
  );
  const otherAdded = route.stops.added.filter((s) => !inMain.has(s)).length;
  const otherRemoved = route.stops.removed.filter((s) => !inMain.has(s)).length;
  const other = [
    otherAdded > 0 && `${otherAdded} added`,
    otherRemoved > 0 && `${otherRemoved} removed`,
  ].filter(Boolean);
  const headsignWas =
    d?.headsign.base && d.headsign.new && d.headsign.base !== d.headsign.new
      ? d.headsign.base
      : null;
  const info = (
    <>
      Each direction&apos;s main stop sequence, original → new: + added, −
      removed; runs of unchanged stops are collapsed.
      {headsignWas ? (
        <>
          <br />
          Headsign was {headsignWas}.
        </>
      ) : null}
      {other.length > 0 ? (
        <>
          <br />
          Stops on other trip patterns: {other.join(', ')}.
        </>
      ) : null}
    </>
  );
  return (
    <Box component='section'>
      <SectionTitle icon={PlaceOutlined} info={info}>
        Stops per direction
      </SectionTitle>
      {route.directions.length > 1 ? (
        <ToggleButtonGroup
          exclusive
          size='small'
          fullWidth
          value={dir}
          onChange={(_, v: number | null) => {
            if (v != null) setDir(v);
          }}
          aria-label='Direction'
          sx={{ mb: 1 }}
        >
          {route.directions.map((x, i) => (
            <ToggleButton
              key={x.direction_id}
              value={i}
              sx={{
                textTransform: 'none',
                fontSize: '0.75rem',
                py: 0.25,
                lineHeight: 1.3,
              }}
            >
              {directionLabel(x)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      ) : d ? (
        <Typography variant='body2' sx={{ mb: 1 }}>
          {directionLabel(d)}
        </Typography>
      ) : null}
      {d ? (
        <>
          <StopStrip
            key={d.direction_id}
            direction={d}
            stops={route.stop_info}
            railColor={railColor}
            onHoverStop={onHoverStop}
          />
        </>
      ) : (
        <Typography variant='body2' color='text.secondary'>
          No trips in either feed.
        </Typography>
      )}
    </Box>
  );
}

const SERVICE_GROUP_COLORS: Partial<Record<ServiceGroupKey, string>> = {
  added: ADDED,
  removed: REMOVED,
};

function ServiceIds({
  route,
  servicesUrl,
  onOpenService,
  onOpenCalendar,
}: {
  route: RouteDetail;
  /** calendar/services.parquet, for the status of the shared services. */
  servicesUrl: string;
  onOpenService: (serviceId: string) => void;
  onOpenCalendar: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const base = new Set(route.services.base);
  const next = new Set(route.services.new);
  const all = new Set([...base, ...next]);
  const shared = route.services.base.filter((id) => next.has(id));
  const removed = [...base].filter((id) => !next.has(id)).length;
  const added = [...next].filter((id) => !base.has(id)).length;
  // Modified vs unchanged comes from the calendar page's table, read once
  // the list opens; until then (or without it) shared services stay together.
  const status = useMapTableQuery(
    open && shared.length > 0 ? servicesUrl : null,
    shared.join('\u001f'),
    (v) => serviceStatusQuery(v, shared),
    (rows): Record<string, string> =>
      Object.fromEntries(
        rows.map((r) => [String(r.service_id), String(r.status)]),
      ),
  );
  const groups = serviceGroups(
    route.services,
    status.error ? null : (status.data ?? null),
    search,
  );
  return (
    <Box component='section'>
      <SectionTitle icon={CalendarMonthOutlined}>Services</SectionTitle>
      <Button
        size='small'
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        endIcon={open ? <ExpandLess /> : <ExpandMore />}
        sx={{
          textTransform: 'none',
          px: 0.5,
          ml: -0.5,
          color: 'text.primary',
        }}
      >
        {all.size.toLocaleString()} service_id{all.size === 1 ? '' : 's'} ·{' '}
        {removed} removed, {added} added
      </Button>
      {open ? (
        <Box
          sx={{
            mt: 0.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <TextField
              size='small'
              fullWidth
              placeholder='Search service_id'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                htmlInput: { 'aria-label': 'Search service_id' },
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <Search fontSize='small' />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position='end'>
                      <IconButton
                        size='small'
                        aria-label='Clear search'
                        onClick={() => setSearch('')}
                      >
                        <Close fontSize='small' />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
          </Box>
          <List
            dense
            disablePadding
            aria-label='Service IDs'
            sx={{ maxHeight: 240, overflowY: 'auto' }}
          >
            {groups.map((g) => (
              <li key={g.key}>
                <Box component='ul' sx={{ p: 0 }}>
                  <ListSubheader
                    sx={{
                      lineHeight: '28px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: SERVICE_GROUP_COLORS[g.key] ?? 'text.secondary',
                      bgcolor: 'background.paper',
                    }}
                  >
                    {g.label} · {g.ids.length.toLocaleString()}
                  </ListSubheader>
                  {g.ids.map((id) => (
                    <ListItem key={id} sx={{ py: 0.25 }}>
                      <ServiceIdLink serviceId={id} onClick={onOpenService} />
                    </ListItem>
                  ))}
                </Box>
              </li>
            ))}
            {groups.length === 0 ? (
              <ListItem>
                <Typography variant='body2' color='text.secondary'>
                  No service_id matches.
                </Typography>
              </ListItem>
            ) : null}
          </List>
        </Box>
      ) : null}
      <Link
        component='button'
        type='button'
        variant='body2'
        color='secondary'
        underline='hover'
        onClick={onOpenCalendar}
        sx={{ ...SECTION_LINK_SX, display: 'block', mb: 2 }}
      >
        Open in Service Dates →
      </Link>
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
  onOpenService: (serviceId: string) => void;
  onOpenCalendar: () => void;
  tripsHref: string;
  servicesUrl: string;
  /** Show this route's routes.txt row in the raw file diff. */
  onSeeFieldChanges: () => void;
}

/** One route, top to bottom: header, fields, shapes, stops, trips per day, services. */
export default function RouteDetailV2({
  route: r,
  routesMap,
  routeInfo,
  headingRef,
  onHoverStop,
  selectedShapeId,
  onSelectShape,
  onOpenService,
  onOpenCalendar,
  tripsHref,
  servicesUrl,
  onSeeFieldChanges,
}: RouteDetailV2Props): React.ReactElement {
  const kind = routeKind(r);
  const railColor = r.color ? `#${r.color}` : '#757575';
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

      {r.shapes ? (
        <Box component='section'>
          <SectionTitle
            icon={Timeline}
            info={`${shapesPathSummary(r, r.shapes, routesMap.path_change_threshold_m)}. Select a shape to draw it on the map.`}
          >
            {`Shapes (${r.shapes.length})`}
          </SectionTitle>
          <RouteShapes
            compact
            route={r}
            shapes={r.shapes}
            routeInfo={routeInfo}
            thresholdM={routesMap.path_change_threshold_m}
            sameM={routesMap.shape_same_m ?? 2}
            selectedShapeId={selectedShapeId}
            onSelectShape={onSelectShape}
          />
        </Box>
      ) : null}
      <StopsPerDirection
        route={r}
        railColor={railColor}
        onHoverStop={onHoverStop}
      />
      <TypicalTrips
        route={r}
        serviceWindow={routesMap.service_window}
        tripsHref={tripsHref}
      />
      <ServiceIds
        route={r}
        servicesUrl={servicesUrl}
        onOpenService={onOpenService}
        onOpenCalendar={onOpenCalendar}
      />
    </Box>
  );
}
