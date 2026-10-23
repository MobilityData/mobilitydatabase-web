'use client';

import { Box, FormControlLabel, Switch, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { PathwayLink, SparseRow } from '../../lib/pathways-types';
import {
  type SchematicLayout,
  layoutSchematic,
} from '../../lib/pathways-layout';
import {
  type StationAnalysis,
  formatDuration,
  linkEndpoints,
  linkTitle,
  pathwaySeconds,
} from '../../lib/pathways-utils';
import { DIFF_COLORS, MONO_FONT, Section, statusColor } from './shared';

/** Above this many nodes the schematic starts focused on what changed. */
const FOCUS_THRESHOLD = 12;

const CHAR_W = 6.6;

function truncate(text: string, maxPx: number): string {
  const max = Math.floor(maxPx / CHAR_W);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function slowestSeconds(rows: SparseRow[]): number | null {
  if (rows.length === 0) return null;
  return Math.max(...rows.map((r) => pathwaySeconds(r, false).seconds));
}

/** Short text drawn on a link, e.g. "Walkway · 13 → 41 s". */
function linkCaption(link: PathwayLink): string {
  const title = linkTitle(link);
  const b = slowestSeconds(link.base);
  const n = slowestSeconds(link.new);
  if (link.status === 'deleted') return `${title} · removed`;
  if (link.status === 'added')
    return `${title} · ${formatDuration(n ?? 0)} · new`;
  if (b != null && n != null && Math.round(b) !== Math.round(n))
    return `${title} · ${Math.round(b)} → ${formatDuration(n)}`;
  const fields = [...new Set(link.field_changes.map((c) => c.field))];
  if (link.status === 'modified' && fields.length > 0)
    return `${title} · ${fields.join(', ').replace(/_/g, ' ')} changed`;
  return `${title} · ${formatDuration(n ?? b ?? 0)}`;
}

interface LinkGeometry {
  link: PathwayLink;
  d: string;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'middle';
}

function linkGeometry(
  links: PathwayLink[],
  layout: SchematicLayout,
): LinkGeometry[] {
  const w = layout.nodeWidth;
  const h = layout.nodeHeight;
  // Parallel links between the same two nodes are spread apart.
  const pairCount = new Map<string, number>();
  const pairIndex = new Map<string, number>();
  for (const l of links) {
    const k = `${l.a}|${l.b}`;
    pairIndex.set(l.id, pairCount.get(k) ?? 0);
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }
  const out: LinkGeometry[] = [];
  for (const link of links) {
    const a = layout.byId.get(link.a);
    const b = layout.byId.get(link.b);
    if (a == null || b == null) continue;
    const n = pairCount.get(`${link.a}|${link.b}`) ?? 1;
    const off = ((pairIndex.get(link.id) ?? 0) - (n - 1) / 2) * 10;
    if (a.band === b.band) {
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      const adjacent = !layout.nodes.some(
        (o) => o.band === a.band && o.x > l.x && o.x < r.x,
      );
      if (adjacent) {
        const y = l.y + h / 2 + off;
        out.push({
          link,
          d: `M${l.x + w},${y}H${r.x}`,
          labelX: (l.x + w + r.x) / 2,
          // The gap between neighbours is too narrow for text: caption below.
          labelY: l.y + h + 15,
          anchor: 'middle',
        });
      } else {
        // Arc over the nodes in between.
        const x1 = l.x + w / 2 + off;
        const x2 = r.x + w / 2 + off;
        const top = l.y - 18 - Math.min(40, (r.x - l.x) / 20);
        out.push({
          link,
          d: `M${x1},${l.y}C${x1},${top} ${x2},${top} ${x2},${r.y}`,
          labelX: (x1 + x2) / 2,
          labelY: top + 8,
          anchor: 'middle',
        });
      }
    } else {
      const [u, v] = a.y < b.y ? [a, b] : [b, a];
      const x1 = u.x + w / 2 + off;
      const x2 = v.x + w / 2 + off;
      const y1 = u.y + h;
      const y2 = v.y;
      out.push({
        link,
        d: `M${x1},${y1}L${x2},${y2}`,
        labelX: (x1 + x2) / 2 + 6,
        labelY: (y1 + y2) / 2 + 4,
        anchor: 'start',
      });
    }
  }
  return out;
}

function LegendLine({
  color,
  dashed = false,
  label,
}: {
  color: string;
  dashed?: boolean;
  label: string;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={{
          width: 24,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        }}
      />
      <Typography variant='caption'>{label}</Typography>
    </Box>
  );
}

const LEGEND = (
  <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', mb: 2 }}>
    <LegendLine color={DIFF_COLORS.added} label='Added' />
    <LegendLine color={DIFF_COLORS.removed} dashed label='Removed (dashed)' />
    <LegendLine color={DIFF_COLORS.changed} label='Changed' />
    <LegendLine color={DIFF_COLORS.unchanged} label='Unchanged' />
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={{
          width: 18,
          height: 12,
          border: '2.5px solid',
          borderColor: 'text.primary',
          borderRadius: '2px',
        }}
      />
      <Typography variant='caption'>Route endpoints</Typography>
    </Box>
  </Box>
);

interface StationSchematicProps {
  analysis: StationAnalysis;
  /** Links on the selected route (before or after). */
  routeLinks: Set<string>;
  /** Entrance and platform of the selected route. */
  endpoints: string[];
}

export default function StationSchematic({
  analysis,
  routeLinks,
  endpoints,
}: StationSchematicProps): React.ReactElement {
  const { station, labels } = analysis;
  const large = station.nodes.length > FOCUS_THRESHOLD;
  const [showAll, setShowAll] = useState(false);

  // For large stations: nodes touched by a change or by the selected route.
  const focus = useMemo(() => {
    if (!large || showAll) return undefined;
    const ids = new Set<string>(endpoints);
    for (const l of station.links) {
      if (
        routeLinks.has(l.id) ||
        (l.status !== 'unchanged' && l.status !== 'restructured')
      ) {
        ids.add(l.a).add(l.b);
      }
    }
    for (const n of station.nodes)
      if (n.status !== 'unchanged') ids.add(n.stop_id);
    return ids;
  }, [large, showAll, station, routeLinks, endpoints]);

  const layout = useMemo(
    () => layoutSchematic(station, labels, focus),
    [station, labels, focus],
  );
  const geometry = useMemo(
    () => linkGeometry(station.links, layout),
    [station.links, layout],
  );

  const highlighting = routeLinks.size > 0;
  const endpointSet = new Set(endpoints);
  const nodeById = new Map(station.nodes.map((n) => [n.stop_id, n]));
  const w = layout.nodeWidth;
  const h = layout.nodeHeight;
  const halo = {
    paintOrder: 'stroke' as const,
    stroke: 'var(--mui-palette-background-paper)',
    strokeWidth: 4,
    strokeLinejoin: 'round' as const,
  };

  // Draw dimmed links first so highlighted ones sit on top.
  const ordered = [...geometry].sort(
    (x, y) =>
      Number(routeLinks.has(x.link.id)) - Number(routeLinks.has(y.link.id)),
  );

  return (
    <Section
      title='Station schematic'
      description='Levels are stacked by level_index. The route selected above is highlighted, and other pathways are dimmed.'
      action={
        large ? (
          <FormControlLabel
            control={
              <Switch
                size='small'
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
            }
            label={
              <Typography variant='body2'>
                Show all {station.nodes.length} nodes
              </Typography>
            }
          />
        ) : undefined
      }
    >
      {LEGEND}
      <Box sx={{ overflowX: 'auto' }}>
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role='img'
          aria-label={`Pathway schematic of ${station.name}`}
          style={{
            display: 'block',
            fontFamily: 'inherit',
            // Shrink to fit down to 75%, then scroll.
            width: '100%',
            maxWidth: layout.width,
            minWidth: Math.round(layout.width * 0.75),
            height: 'auto',
          }}
        >
          {layout.bands.map((band) => (
            <g key={band.index}>
              <rect
                x={4}
                y={band.y}
                width={layout.width - 8}
                height={band.height}
                rx={4}
                fill='var(--mui-palette-action-hover)'
              />
              <text
                x={16}
                y={band.y + 22}
                fontSize={13}
                fontWeight={700}
                fill='var(--mui-palette-text-primary)'
              >
                {truncate(band.name, 130)}
              </text>
              {band.levelIndex != null ? (
                <text
                  x={16}
                  y={band.y + 38}
                  fontSize={11}
                  fontFamily={MONO_FONT}
                  fill='var(--mui-palette-text-secondary)'
                >
                  level_index {band.levelIndex}
                </text>
              ) : null}
              {band.renamedFrom != null ? (
                <text
                  x={16}
                  y={band.y + 54}
                  fontSize={11}
                  fontWeight={700}
                  fill={DIFF_COLORS.changed}
                >
                  <tspan x={16}>Renamed from</tspan>
                  <tspan x={16} dy={14}>
                    {truncate(`“${band.renamedFrom}”`, 130)}
                  </tspan>
                </text>
              ) : band.status === 'added' || band.status === 'deleted' ? (
                <text
                  x={16}
                  y={band.y + 54}
                  fontSize={11}
                  fontWeight={700}
                  fill={statusColor(band.status)}
                >
                  {band.status === 'added' ? 'New level' : 'Removed level'}
                </text>
              ) : null}
            </g>
          ))}

          {ordered.map((g) => {
            const onRoute = routeLinks.has(g.link.id);
            const color =
              g.link.status === 'unchanged' || g.link.status === 'restructured'
                ? onRoute
                  ? 'var(--mui-palette-text-primary)'
                  : DIFF_COLORS.unchanged
                : statusColor(g.link.status);
            const dim = highlighting && !onRoute;
            const showLabel =
              onRoute ||
              (!dim &&
                g.link.status !== 'unchanged' &&
                g.link.status !== 'restructured');
            return (
              <g key={g.link.id} opacity={dim ? 0.3 : 1}>
                <title>
                  {`${linkTitle(g.link)}: ${linkEndpoints(g.link, labels)} (${g.link.status})`}
                </title>
                <path
                  d={g.d}
                  fill='none'
                  stroke={color}
                  strokeWidth={onRoute ? 3.5 : 2}
                  strokeDasharray={
                    g.link.status === 'deleted' ? '6 4' : undefined
                  }
                />
                {showLabel ? (
                  <text
                    x={g.labelX}
                    y={g.labelY}
                    fontSize={11}
                    fontWeight={onRoute ? 700 : 400}
                    textAnchor={g.anchor}
                    fill={
                      g.link.status === 'unchanged' ||
                      g.link.status === 'restructured'
                        ? 'var(--mui-palette-text-secondary)'
                        : color
                    }
                    style={halo}
                  >
                    {linkCaption(g.link)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {layout.nodes.map((n) => {
            const node = nodeById.get(n.id);
            const label = labels.get(n.id);
            const isEndpoint = endpointSet.has(n.id);
            const status = node?.status ?? 'unchanged';
            const stroke =
              status === 'unchanged'
                ? isEndpoint
                  ? 'var(--mui-palette-text-primary)'
                  : 'var(--mui-palette-primary-light)'
                : statusColor(status);
            return (
              <g key={n.id}>
                <title>
                  {`${label?.title ?? n.id} (${n.id})${status !== 'unchanged' ? `, ${status}` : ''}`}
                </title>
                <rect
                  x={n.x}
                  y={n.y}
                  width={w}
                  height={h}
                  rx={3}
                  fill='var(--mui-palette-background-paper)'
                  stroke={stroke}
                  strokeWidth={isEndpoint ? 3 : 1.25}
                  strokeDasharray={status === 'deleted' ? '5 3' : undefined}
                />
                <text
                  x={n.x + w / 2}
                  y={n.y + 18}
                  fontSize={12}
                  fontWeight={700}
                  textAnchor='middle'
                  fill='var(--mui-palette-text-primary)'
                >
                  {truncate(label?.title ?? n.id, w - 12)}
                </text>
                <text
                  x={n.x + w / 2}
                  y={n.y + 33}
                  fontSize={10}
                  fontFamily={label?.kind === 'node' ? MONO_FONT : undefined}
                  textAnchor='middle'
                  fill='var(--mui-palette-text-secondary)'
                >
                  {truncate(label?.subtitle ?? '', w - 12)}
                </text>
              </g>
            );
          })}
        </svg>
      </Box>
      {focus != null ? (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ mt: 1, display: 'block' }}
        >
          Showing {layout.nodes.length} of {station.nodes.length} nodes: those
          on the selected route or touched by a change.
        </Typography>
      ) : null}
    </Section>
  );
}
