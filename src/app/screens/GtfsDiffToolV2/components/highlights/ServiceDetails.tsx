'use client';

import { Box, Typography } from '@mui/material';
import React from 'react';
import { Link } from '../../../../../i18n/navigation';
import type { ServiceEntities } from '../../lib/trips-service-highlights';
import { hourText } from '../../lib/trips-service-highlights';
import { formatTime } from '../../lib/trips-utils';
import { DEFAULT_TRIPS_VIEW, tripsRouteHref } from '../../lib/trips-v2-routes';

const BEFORE = '#bdbdbd';
const MORE = '#2e7d32';
const LESS = '#d32f2f';
const SAME = '#546e7a';

/** Width of the "06:00–00:00 → 08:26–18:57" column of span rows. */
const TIMES_W = 170;

const routeLinkSx = {
  color: 'text.primary',
  fontWeight: 700,
  fontSize: '0.8rem',
  textDecoration: 'none',
  '&:hover': { textDecoration: 'underline' },
} as const;

/** Before / after swatches. */
function Key({
  items,
}: {
  items: Array<[string, string]>;
}): React.ReactElement {
  const item = (color: string, label: string): React.ReactElement => (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: color }}
      />
      <Typography variant='caption' color='text.secondary'>
        {label}
      </Typography>
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 1 }}>
      {items.map(([color, label]) => (
        <React.Fragment key={label}>{item(color, label)}</React.Fragment>
      ))}
    </Box>
  );
}

/** Hour labels under a chart spanning hours [from, to). */
function HourAxis({
  from,
  to,
  labels,
}: {
  from: number;
  to: number;
  labels: number[];
}): React.ReactElement {
  return (
    <Box sx={{ position: 'relative', height: 16 }}>
      {labels.map((h) => (
        <Typography
          key={h}
          variant='caption'
          color='text.secondary'
          sx={{
            position: 'absolute',
            left: `${((h - from) / (to - from)) * 100}%`,
            transform: 'translateX(-50%)',
            fontSize: '0.66rem',
            whiteSpace: 'nowrap',
          }}
        >
          {hourText(h)}
        </Typography>
      ))}
    </Box>
  );
}

function axisLabels(from: number, to: number): number[] {
  const out: number[] = [];
  for (let h = Math.ceil(from / 6) * 6; h < to; h += 6)
    if (h > from) out.push(h);
  return out;
}

function Row({
  label,
  when,
  href,
  chart,
}: {
  label: string;
  when: string;
  href: string;
  chart: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' },
        columnGap: 1.5,
        alignItems: 'center',
        py: 0.5,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography component={Link} href={href} sx={routeLinkSx}>
          Route {label}
        </Typography>
        {when ? (
          <Typography
            variant='caption'
            color='text.secondary'
            component='div'
            noWrap
          >
            {when}
          </Typography>
        ) : null}
      </Box>
      {chart}
    </Box>
  );
}

/** Trips starting each hour: before as a wide grey bar, after inside it. */
function HourBars({
  base,
  next,
  from,
  to,
  hour,
}: {
  base: number[];
  next: number[];
  from: number;
  to: number;
  hour?: number;
}): React.ReactElement {
  const slots = to - from;
  const max = Math.max(1, ...base.slice(from, to), ...next.slice(from, to));
  const H = 36;
  return (
    <svg
      viewBox={`0 0 ${slots * 10} ${H}`}
      preserveAspectRatio='none'
      width='100%'
      height={H}
      role='img'
      aria-label='Trips per hour, before and after'
    >
      {Array.from({ length: slots }, (_, i) => {
        const h = from + i;
        const b = base[h] ?? 0;
        const n = next[h] ?? 0;
        const bh = (b / max) * (H - 2);
        const nh = (n / max) * (H - 2);
        return (
          <g key={h}>
            <title>{`${hourText(h)}: ${b} → ${n} trips`}</title>
            <rect x={i * 10} y={0} width={10} height={H} fill='transparent' />
            <rect
              x={i * 10 + 1}
              y={H - bh}
              width={8}
              height={bh}
              fill={BEFORE}
            />
            <rect
              x={i * 10 + 3}
              y={H - nh}
              width={4}
              height={nh}
              fill={
                // Only what the highlight is about stands out: its hour, or
                // the hours that gained trips.
                hour != null ? (h === hour ? LESS : SAME) : n > b ? MORE : SAME
              }
            />
          </g>
        );
      })}
    </svg>
  );
}

/** First to last trip, before (grey) and after, the hours lost in red. */
function SpanBars({
  base,
  next,
  from,
  to,
}: {
  base: [number, number];
  next: [number, number];
  from: number;
  to: number;
}): React.ReactElement {
  const W = 1000;
  const x = (sec: number): number => ((sec / 3600 - from) / (to - from)) * W;
  const lost: Array<[number, number]> = [];
  if (next[0] > base[0]) lost.push([base[0], next[0]]);
  if (next[1] < base[1]) lost.push([next[1], base[1]]);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: `1fr ${TIMES_W}px` },
        alignItems: 'center',
        columnGap: 1.5,
      }}
    >
      <svg
        viewBox={`0 0 ${W} 26`}
        preserveAspectRatio='none'
        width='100%'
        height={26}
        role='img'
        aria-label={`Service ${formatTime(base[0])}–${formatTime(base[1])} before, ${formatTime(next[0])}–${formatTime(next[1])} after`}
      >
        <rect
          x={x(base[0])}
          y={2}
          width={x(base[1]) - x(base[0])}
          height={9}
          rx={3}
          fill={BEFORE}
        />
        {lost.map(([a, b]) => (
          <rect
            key={a}
            x={x(a)}
            y={2}
            width={x(b) - x(a)}
            height={9}
            fill={LESS}
          />
        ))}
        <rect
          x={x(next[0])}
          y={15}
          width={x(next[1]) - x(next[0])}
          height={9}
          rx={3}
          fill={SAME}
        />
      </svg>
      <Typography
        variant='caption'
        color='text.secondary'
        sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
      >
        {formatTime(base[0])}–{formatTime(base[1])} → {formatTime(next[0])}–
        {formatTime(next[1])}
      </Typography>
    </Box>
  );
}

/**
 * What a service highlight (lib/trips-service-highlights) expands to: each
 * route's trips per hour, or its hours of service, before and after.
 */
export default function ServiceDetails({
  entities: e,
  datasetId,
}: {
  entities: ServiceEntities;
  datasetId: string;
}): React.ReactElement {
  const href = (route: string): string =>
    tripsRouteHref(datasetId, route, { view: DEFAULT_TRIPS_VIEW });

  if (e.kind === 'stops')
    return (
      <Box component='ul' sx={{ m: 0, pl: 2.5 }}>
        {e.rows.map((r) => (
          <Typography component='li' variant='body2' key={r.id}>
            {r.label}{' '}
            <Typography
              component='span'
              variant='caption'
              color='text.secondary'
            >
              {r.note}
            </Typography>
          </Typography>
        ))}
      </Box>
    );

  if (e.kind === 'spans') {
    const from = Math.floor(
      Math.min(...e.rows.map((r) => Math.min(r.base[0], r.new[0]))) / 3600,
    );
    const to = Math.ceil(
      Math.max(...e.rows.map((r) => Math.max(r.base[1], r.new[1]))) / 3600,
    );
    const sameWhen = new Set(e.rows.map((r) => r.when)).size === 1;
    return (
      <Box>
        {sameWhen ? <When text={e.rows[0].when} /> : null}
        <Key
          items={[
            [BEFORE, 'Before'],
            [SAME, 'After'],
            [LESS, 'Hours lost'],
          ]}
        />
        {e.rows.map((r) => (
          <Row
            key={r.route}
            label={r.label}
            when={sameWhen ? '' : r.when}
            href={href(r.route)}
            chart={
              <SpanBars
                base={r.base}
                next={r.new}
                from={from}
                to={Math.max(to, from + 1)}
              />
            }
          />
        ))}
        <ChartAxis from={from} to={Math.max(to, from + 1)} times />
      </Box>
    );
  }

  // Hours: the window any route runs in.
  let from = 30;
  let to = 0;
  for (const r of e.rows)
    r.base.forEach((b, h) => {
      if (b > 0 || (r.new[h] ?? 0) > 0) {
        from = Math.min(from, h);
        to = Math.max(to, h + 1);
      }
    });
  if (to <= from) return <Box />;
  const sameWhen = new Set(e.rows.map((r) => r.when)).size === 1;
  const focused = e.rows.some((r) => r.hour != null);
  return (
    <Box>
      {sameWhen ? <When text={e.rows[0].when} /> : null}
      <Key
        items={[
          [BEFORE, 'Before'],
          [SAME, 'After'],
          focused ? [LESS, 'Fewer trips'] : [MORE, 'More trips'],
        ]}
      />
      {e.rows.map((r) => (
        <Row
          key={r.route}
          label={r.label}
          when={
            r.hour != null
              ? `${hourText(r.hour)}${sameWhen ? '' : `, ${r.when}`}`
              : sameWhen
                ? ''
                : r.when
          }
          href={href(r.route)}
          chart={
            <HourBars
              base={r.base}
              next={r.new}
              from={from}
              to={to}
              hour={r.hour}
            />
          }
        />
      ))}
      <ChartAxis from={from} to={to} />
    </Box>
  );
}

/** The day a highlight is about, once for all its rows. */
function When({ text }: { text: string }): React.ReactElement {
  return (
    <Typography variant='body2' fontWeight={700} sx={{ mb: 0.5 }}>
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </Typography>
  );
}

/** Hour labels lined up under the rows' charts. */
function ChartAxis({
  from,
  to,
  times = false,
}: {
  from: number;
  to: number;
  /** Rows have a times column on the right (spans). */
  times?: boolean;
}): React.ReactElement {
  return (
    <Box
      sx={{
        display: { xs: 'none', sm: 'grid' },
        gridTemplateColumns: times ? `140px 1fr ${TIMES_W}px` : '140px 1fr',
        columnGap: 1.5,
      }}
    >
      <Box />
      <HourAxis from={from} to={to} labels={axisLabels(from, to)} />
    </Box>
  );
}
