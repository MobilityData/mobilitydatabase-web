'use client';

import { Box, Typography } from '@mui/material';
import React from 'react';
import type { EntityTypeDiff, RawTable } from '../lib/entity-diff-types';
import RawFileDiffCard from './raw/RawFileDiffCard';

const MONO_FONT = 'var(--font-ibm-plex-mono)';

const COUNT_STYLES: Array<{
  key: keyof EntityTypeDiff['counts'];
  sign: string;
  color: string;
}> = [
  { key: 'added', sign: '+', color: '#2e7d32' },
  { key: 'deleted', sign: '−', color: '#d32f2f' },
  { key: 'modified', sign: '~', color: '#ed6c02' },
  { key: 'unchanged', sign: '=', color: 'text.secondary' },
];

/**
 * One file's entity counts: its key, totals per feed and changes by status.
 * The changed rows themselves are in its raw file diff below.
 */
function EntityTypeSummary({
  entityType,
}: {
  entityType: EntityTypeDiff;
}): React.ReactElement {
  const presence = !entityType.present.base
    ? 'Added in new feed'
    : !entityType.present.new
      ? 'Removed in new feed'
      : null;
  return (
    <Box
      sx={{ bgcolor: 'background.paper', borderRadius: '6px', p: 2.5, mb: 2 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 700 }}>
          {entityType.file}
          {entityType.child_files.length > 0 && (
            <Typography
              component='span'
              variant='caption'
              color='text.secondary'
              sx={{ ml: 1 }}
            >
              + {entityType.child_files.join(', ')}
            </Typography>
          )}
        </Typography>
        <Typography variant='caption' color='text.secondary'>
          Key: {entityType.primary_key.join(', ') || '(row)'} ·{' '}
          {entityType.total.base.toLocaleString()} →{' '}
          {entityType.total.new.toLocaleString()} entities
        </Typography>
        {presence && (
          <Typography variant='caption' fontWeight={700}>
            {presence}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1.5, fontFamily: MONO_FONT }}>
          {COUNT_STYLES.map((c) => (
            <Typography
              key={c.key}
              variant='body2'
              sx={{ fontFamily: MONO_FONT, color: c.color }}
            >
              {c.sign}
              {entityType.counts[c.key].toLocaleString()}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

interface GenericEntityPanelProps {
  entityTypes: EntityTypeDiff[];
  datasetId?: string;
  /** Row diffs of the files that changed, shown under the files' counts. */
  rawTables?: RawTable[];
}

export default function GenericEntityPanel({
  entityTypes,
  datasetId,
  rawTables = [],
}: GenericEntityPanelProps): React.ReactElement {
  if (entityTypes.length === 0) {
    return (
      <Typography color='text.secondary'>
        None of these files are present in either feed.
      </Typography>
    );
  }
  return (
    <Box>
      {entityTypes.map((et) => (
        <EntityTypeSummary key={et.file} entityType={et} />
      ))}
      {datasetId != null && rawTables.length > 0 ? (
        <Box sx={{ mt: 3 }}>
          <Typography variant='h6' fontWeight={700} sx={{ mb: 2 }}>
            Raw file diff
          </Typography>
          {rawTables.map((t) => (
            <RawFileDiffCard key={t.file} datasetId={datasetId} table={t} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
