'use client';

import { Box, Button, ButtonBase, Chip, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { DiffDataset } from '../../lib/datasets';
import type { ReportSummary } from '../../lib/report';
import ReportLayout from '../report/ReportLayout';
import type { PathwaysDiff } from '../../lib/pathways-types';
import {
  type RouteMode,
  type Severity,
  type StationAnalysis,
  type StationSummary,
  analyzeStation,
  formatDuration,
  stationSeverity,
} from '../../lib/pathways-utils';
import FieldChangesTable from './FieldChangesTable';
import ReachabilityPanel, {
  cellKey,
  defaultCell,
  routeLinkIds,
} from './ReachabilityPanel';
import StationSchematic from './StationSchematic';
import { StatusBadge, TONES } from './shared';

const COLLAPSED_CARDS = 9;

interface Pill {
  text: React.ReactNode;
  severity: Severity | 'outline';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function countList(parts: Array<[number, string]>): string {
  return parts
    .filter(([n]) => n > 0)
    .map(([n, w]) => `${n} ${w}`)
    .join(', ');
}

function summaryPills(s: StationSummary): Pill[] {
  const pills: Pill[] = [];
  const route = (n: number): string => plural(n, 'route');
  if (s.fastest.lost > 0)
    pills.push({
      text: `${route(s.fastest.lost)} no longer reachable`,
      severity: 'error',
    });
  if (s.stepFree.lost > 0)
    pills.push({
      text: `${route(s.stepFree.lost)} lost step-free access`,
      severity: 'error',
    });
  if (s.stepFree.gained > 0)
    pills.push({
      text: `${route(s.stepFree.gained)} gained step-free access`,
      severity: 'success',
    });
  if (s.fastest.gained > 0)
    pills.push({
      text: `${route(s.fastest.gained)} newly reachable`,
      severity: 'success',
    });
  if (s.fastest.slower > 0)
    pills.push({
      text: `${route(s.fastest.slower)} slower, by up to ${formatDuration(s.fastest.maxSlowerS)}`,
      severity: 'warning',
    });
  if (s.stepFree.slower > 0)
    pills.push({
      text: `${plural(s.stepFree.slower, 'step-free route')} slower, by up to ${formatDuration(s.stepFree.maxSlowerS)}`,
      severity: 'warning',
    });
  if (s.fastest.faster + s.stepFree.faster > 0)
    pills.push({
      text: `${route(s.fastest.faster + s.stepFree.faster)} faster, by up to ${formatDuration(Math.max(s.fastest.maxFasterS, s.stepFree.maxFasterS))}`,
      severity: 'success',
    });

  const groups: Array<[string, string]> = [
    [
      'Pathways',
      countList([
        [s.links.added, 'added'],
        [s.links.deleted, 'removed'],
        [s.links.modified, 'modified'],
      ]),
    ],
    [
      'Levels',
      countList([
        [s.levels.added, 'added'],
        [s.levels.deleted, 'removed'],
        [s.levels.renamed, 'renamed'],
        [s.levels.modified, 'modified'],
      ]),
    ],
    [
      'Stops',
      countList([
        [s.nodes.added, 'added'],
        [s.nodes.deleted, 'removed'],
        [s.nodes.modified, 'modified'],
      ]),
    ],
  ];
  const present = groups.filter(([, t]) => t !== '');
  if (present.length > 0) {
    pills.push({
      severity: 'outline',
      text: present.map(([g, t], i) => (
        <React.Fragment key={g}>
          {i > 0 ? ' · ' : ''}
          <strong>{g}:</strong> {t}
        </React.Fragment>
      )),
    });
  }
  if (s.links.restructured > 0)
    pills.push({
      text: `${plural(s.links.restructured, 'pathway')} restructured, no rider-visible change`,
      severity: 'neutral',
    });
  return pills;
}

function SummaryPill({ pill }: { pill: Pill }): React.ReactElement {
  const outline = pill.severity === 'outline';
  const tone = outline ? null : TONES[pill.severity as Severity];
  return (
    <Box
      sx={{
        px: 1.25,
        py: 0.75,
        borderRadius: '4px',
        fontSize: '0.8rem',
        border: '1px solid',
        borderColor: outline ? 'primary.light' : tone?.border,
        bgcolor: outline ? 'background.paper' : tone?.bg,
      }}
    >
      {pill.text}
    </Box>
  );
}

interface StationCardProps {
  analysis: StationAnalysis;
  selected: boolean;
  onSelect: (id: string) => void;
}

function StationCard({
  analysis,
  selected,
  onSelect,
}: StationCardProps): React.ReactElement {
  const { station, summary } = analysis;
  return (
    <ButtonBase
      onClick={() => onSelect(station.station_id)}
      aria-pressed={selected}
      sx={{
        display: 'block',
        textAlign: 'left',
        p: 1.5,
        borderRadius: '4px',
        border: selected ? '2px solid' : '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: 'background.paper',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 1,
        }}
      >
        <Typography variant='body2' fontWeight={700}>
          {station.name}
        </Typography>
        {selected ? (
          <Typography variant='caption' color='text.secondary'>
            Viewing
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', my: 1 }}>
        {summary.badges.map((b) => (
          <StatusBadge key={b.label} label={b.label} severity={b.severity} />
        ))}
      </Box>
      <Typography variant='caption' color='text.secondary'>
        {summary.detail}
      </Typography>
    </ButtonBase>
  );
}

function SectionTitle({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      component='h2'
      sx={{
        m: 0,
        mb: 1.5,
        fontSize: '1.25rem',
        fontWeight: 700,
        color: 'primary.main',
      }}
    >
      {children}
    </Box>
  );
}

interface PathwaysDiffScreenProps {
  diff: PathwaysDiff;
  dataset: DiffDataset;
  report: ReportSummary;
}

export default function PathwaysDiffScreen({
  diff,
  dataset,
  report,
}: PathwaysDiffScreenProps): React.ReactElement {
  const analyses = useMemo(
    () =>
      diff.stations
        .map(analyzeStation)
        .sort(
          (a, b) =>
            stationSeverity(a.summary) - stationSeverity(b.summary) ||
            a.station.name.localeCompare(b.station.name),
        ),
    [diff],
  );
  const [stationId, setStationId] = useState<string | undefined>(
    () => analyses[0]?.station.station_id,
  );
  const [mode, setMode] = useState<RouteMode>('step_free');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [allCards, setAllCards] = useState(false);

  const active =
    analyses.find((a) => a.station.station_id === stationId) ?? analyses[0];
  // The selected cell plus what the schematic needs from it, derived together
  // so the schematic's layout memo only reruns when the selection changes.
  const { selected, routeLinks, endpoints } = useMemo(() => {
    const cells = active?.matrices[mode].cells ?? [];
    const cell =
      cells.find((c) => cellKey(c) === selectedKey) ?? defaultCell(cells);
    return {
      selected: cell,
      routeLinks: routeLinkIds(cell),
      endpoints: cell ? [cell.entrance, cell.platform] : [],
    };
  }, [active, mode, selectedKey]);

  const selectStation = (id: string): void => {
    setStationId(id);
    setSelectedKey(null);
  };

  const { metadata } = diff;
  const cards = allCards ? analyses : analyses.slice(0, COLLAPSED_CARDS);

  return (
    <ReportLayout
      dataset={dataset}
      report={report}
      section='pathways'
      meta={
        active ? (
          <Chip
            size='small'
            variant='outlined'
            label={`Station · ${active.station.name} (${active.station.station_id})`}
          />
        ) : undefined
      }
    >
      {metadata.note ? (
        <Box
          sx={{
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: '4px',
            px: 1.5,
            py: 1,
            mb: 3,
          }}
        >
          <Typography variant='caption' color='text.secondary'>
            {metadata.note}
          </Typography>
        </Box>
      ) : null}

      {active == null ? (
        <Typography color='text.secondary'>
          No pathway or level changes across{' '}
          {plural(diff.unchanged_station_ids.length, 'station')} with pathways.
        </Typography>
      ) : (
        <>
          {/* Station picker */}
          <SectionTitle>Stations with pathway changes</SectionTitle>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 1.5,
              mb: 1,
            }}
          >
            {cards.map((a) => (
              <StationCard
                key={a.station.station_id}
                analysis={a}
                selected={a === active}
                onSelect={selectStation}
              />
            ))}
          </Box>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              flexWrap: 'wrap',
              mb: 3,
            }}
          >
            {analyses.length > COLLAPSED_CARDS ? (
              <Button size='small' onClick={() => setAllCards((v) => !v)}>
                {allCards
                  ? 'Show fewer stations'
                  : `Show all ${analyses.length} stations`}
              </Button>
            ) : null}
            {diff.unchanged_station_ids.length > 0 ? (
              <Typography variant='caption' color='text.secondary'>
                {plural(diff.unchanged_station_ids.length, 'other station')}{' '}
                with pathways unchanged.
              </Typography>
            ) : null}
          </Box>

          {/* Summary */}
          <SectionTitle>Summary for {active.station.name}</SectionTitle>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            {summaryPills(active.summary).map((p, i) => (
              <SummaryPill key={i} pill={p} />
            ))}
          </Box>

          <ReachabilityPanel
            key={active.station.station_id}
            analysis={active}
            mode={mode}
            onModeChange={setMode}
            selected={selected}
            onSelect={setSelectedKey}
          />
          <StationSchematic
            key={`schematic-${active.station.station_id}`}
            analysis={active}
            routeLinks={routeLinks}
            endpoints={endpoints}
          />
          <FieldChangesTable
            key={`fields-${active.station.station_id}`}
            analysis={active}
          />
        </>
      )}
    </ReportLayout>
  );
}
