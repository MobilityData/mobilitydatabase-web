'use client';

import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { PathwayLink, SparseRow } from '../../lib/pathways-types';
import {
  type NodeLabel,
  type StationAnalysis,
  linkEndpoints,
  linkTitle,
} from '../../lib/pathways-utils';
import { DIFF_COLORS, MONO_FONT, Section } from './shared';

type Tone = 'added' | 'removed' | 'changed';

interface ChangeRow {
  key: string;
  object: string;
  detail: string;
  field: string;
  before: string;
  after: string;
  tone: Tone;
}

const TONE_COLOR: Record<Tone, string> = {
  added: DIFF_COLORS.added,
  removed: DIFF_COLORS.removed,
  changed: DIFF_COLORS.changed,
};

const KIND_LABEL: Record<NodeLabel['kind'], string> = {
  entrance: 'Entrance',
  platform: 'Platform',
  boarding_area: 'Boarding area',
  node: 'Node',
};

/** The attribute that best describes a pathway's cost, for added links. */
function keyAttributes(rows: SparseRow[]): string {
  const r = rows[0];
  if (r == null) return '';
  if (r.traversal_time) return `traversal_time ${r.traversal_time}`;
  if (r.length) return `length ${Number(r.length)}`;
  if (r.stair_count) return `stair_count ${Math.abs(Number(r.stair_count))}`;
  return '';
}

function linkRows(
  link: PathwayLink,
  labels: Map<string, NodeLabel>,
): ChangeRow[] {
  const object = linkTitle(link);
  const detail = linkEndpoints(link, labels);
  if (link.status === 'added' || link.status === 'deleted') {
    const added = link.status === 'added';
    const attrs = keyAttributes(added ? link.new : link.base);
    return [
      {
        key: link.id,
        object,
        detail,
        field: 'pathway',
        before: added ? 'Not present' : 'Present',
        after: added ? `Added${attrs ? `, ${attrs}` : ''}` : 'Removed',
        tone: added ? 'added' : 'removed',
      },
    ];
  }
  const title = (id: string): string => labels.get(id)?.title ?? id;
  return link.field_changes.map((c, i) => ({
    key: `${link.id}-${i}`,
    object,
    detail:
      c.direction == null
        ? detail
        : c.direction === 'ab'
          ? `${title(link.a)} → ${title(link.b)} only`
          : `${title(link.b)} → ${title(link.a)} only`,
    field: c.field,
    before: c.base_value,
    after: c.new_value,
    tone: 'changed',
  }));
}

export function buildChangeRows(analysis: StationAnalysis): ChangeRow[] {
  const { station, labels } = analysis;
  const rows: ChangeRow[] = [];
  for (const link of station.links) {
    if (link.status === 'unchanged' || link.status === 'restructured') continue;
    rows.push(...linkRows(link, labels));
  }
  for (const level of station.levels) {
    if (level.status === 'unchanged') continue;
    const name = (level.new ?? level.base)?.level_name;
    const object = 'Level';
    const detail = name ? `${level.level_id} · ${name}` : level.level_id;
    if (level.status === 'modified') {
      level.field_changes.forEach((c, i) =>
        rows.push({
          key: `${level.level_id}-${i}`,
          object,
          detail: level.level_id,
          field: c.field,
          before: c.base_value,
          after: c.new_value,
          tone: 'changed',
        }),
      );
    } else {
      const added = level.status === 'added';
      rows.push({
        key: level.level_id,
        object,
        detail,
        field: 'level',
        before: added ? 'Not present' : 'Present',
        after: added ? 'Added' : 'Removed',
        tone: added ? 'added' : 'removed',
      });
    }
  }
  for (const node of station.nodes) {
    if (node.status === 'unchanged') continue;
    const label = labels.get(node.stop_id);
    const object = label?.title ?? node.stop_id;
    const detail = `${KIND_LABEL[label?.kind ?? 'node']} · ${node.stop_id}`;
    if (node.status === 'modified') {
      node.field_changes.forEach((c, i) =>
        rows.push({
          key: `${node.stop_id}-${i}`,
          object,
          detail,
          field: c.field,
          before: c.base_value,
          after: c.new_value,
          tone: 'changed',
        }),
      );
    } else {
      const added = node.status === 'added';
      rows.push({
        key: node.stop_id,
        object,
        detail,
        field: 'stop',
        before: added ? 'Not present' : 'Present',
        after: added ? 'Added' : 'Removed',
        tone: added ? 'added' : 'removed',
      });
    }
  }
  return rows;
}

function Value({
  value,
  color,
}: {
  value: string;
  color?: string;
}): React.ReactElement {
  return value === '' ? (
    <Typography variant='body2' color='text.disabled' fontStyle='italic'>
      (empty)
    </Typography>
  ) : (
    <Typography
      variant='body2'
      sx={{ color, fontWeight: color ? 700 : 400, wordBreak: 'break-word' }}
    >
      {value}
    </Typography>
  );
}

interface FieldChangesTableProps {
  analysis: StationAnalysis;
}

export default function FieldChangesTable({
  analysis,
}: FieldChangesTableProps): React.ReactElement {
  const [hidden, setHidden] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const rows = useMemo(() => buildChangeRows(analysis), [analysis]);
  const restructured = analysis.station.links.filter(
    (l) => l.status === 'restructured',
  );

  return (
    <Section
      title='Field-level changes'
      action={
        <Button
          variant='outlined'
          size='small'
          onClick={() => setHidden((h) => !h)}
        >
          {hidden ? 'Show fields' : 'Hide fields'}
        </Button>
      }
    >
      {hidden ? null : rows.length === 0 ? (
        <Typography color='text.secondary' sx={{ mb: 2 }}>
          No field changes.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto', mb: 2 }}>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '30%' }}>Object</TableCell>
                <TableCell sx={{ width: '20%' }}>Field</TableCell>
                <TableCell sx={{ width: '25%' }}>Before</TableCell>
                <TableCell sx={{ width: '25%' }}>After</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <Typography variant='body2' fontWeight={700}>
                      {r.object}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {r.detail}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant='body2'
                      sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem' }}
                    >
                      {r.field}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Value value={r.before} />
                  </TableCell>
                  <TableCell>
                    <Value value={r.after} color={TONE_COLOR[r.tone]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {restructured.length > 0 ? (
        <Box sx={{ bgcolor: 'action.hover', borderRadius: '4px', p: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant='body2'>
              <strong>
                {restructured.length} pathway
                {restructured.length === 1 ? '' : 's'} restructured.
              </strong>{' '}
              Same endpoints, mode and attributes. Only pathway_id changed.
            </Typography>
            <Button
              variant='outlined'
              size='small'
              onClick={() => setShowIds((s) => !s)}
            >
              {showIds ? 'Hide IDs' : 'Show IDs'}
            </Button>
          </Box>
          {showIds ? (
            <Box component='ul' sx={{ m: 0, mt: 1.5, pl: 2.5 }}>
              {restructured.map((l) => (
                <Box component='li' key={l.id} sx={{ mb: 0.5 }}>
                  <Typography variant='body2' component='span' fontWeight={700}>
                    {linkTitle(l)}
                  </Typography>{' '}
                  <Typography
                    variant='caption'
                    component='span'
                    color='text.secondary'
                  >
                    {linkEndpoints(l, analysis.labels)}
                  </Typography>
                  <Box
                    sx={{
                      fontFamily: MONO_FONT,
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                    }}
                  >
                    {l.id_changes.length > 0
                      ? l.id_changes
                          .map((c) => `${c.base} → ${c.new}`)
                          .join(', ')
                      : 'is_bidirectional changed (rows merged or split)'}
                  </Box>
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Section>
  );
}
