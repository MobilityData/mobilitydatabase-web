'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Divider,
  Typography,
  useTheme,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import React from 'react';
import {
  type DiffType,
  type EntityDiffRecord,
  type FieldDelta,
  type MaterializedRoute,
  type MaterializedServicePeriod,
  type MaterializedStop,
  type RouteImpact,
} from '../lib/gtfs-types';

// ── Diff type badge ────────────────────────────────────────────────

function DiffBadge({ type }: { type: DiffType }): React.ReactElement {
  const colorMap: Record<DiffType, string> = {
    added: '#2e7d32',
    deleted: '#d32f2f',
    modified: '#ed6c02',
    unchanged: '#757575',
  };
  return (
    <Chip
      label={type.toUpperCase()}
      size='small'
      sx={{
        bgcolor: colorMap[type],
        color: '#fff',
        fontWeight: 700,
        fontSize: '0.65rem',
        height: 20,
      }}
    />
  );
}

// ── Field delta display ────────────────────────────────────────────

function FieldChangeRow({ delta }: { delta: FieldDelta }): React.ReactElement {
  const formatVal = (v: unknown): string => {
    if (v == null) return '—';
    if (Array.isArray(v)) {
      if (v.length > 10) return `[${v.length} items]`;
      return v.join(', ');
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        py: 0.5,
        alignItems: 'baseline',
        flexWrap: 'wrap',
      }}
    >
      <Typography
        variant='caption'
        sx={{ fontWeight: 700, minWidth: 160 }}
      >
        {delta.field}
      </Typography>
      <Typography
        variant='caption'
        sx={{
          textDecoration: 'line-through',
          color: '#d32f2f',
          wordBreak: 'break-all',
        }}
      >
        {formatVal(delta.oldValue)}
      </Typography>
      <Typography variant='caption' sx={{ color: 'text.secondary' }}>
        →
      </Typography>
      <Typography
        variant='caption'
        sx={{ color: '#2e7d32', fontWeight: 500, wordBreak: 'break-all' }}
      >
        {formatVal(delta.newValue)}
      </Typography>
    </Box>
  );
}

// ── Route impact display ───────────────────────────────────────────

function RouteImpactSection({
  impact,
}: {
  impact: RouteImpact;
}): React.ReactElement {
  const theme = useTheme();
  const sections = [
    {
      label: 'Added trips',
      items: impact.addedTrips,
      color: '#2e7d32',
    },
    {
      label: 'Removed trips',
      items: impact.removedTrips,
      color: '#d32f2f',
    },
    {
      label: 'Modified trips',
      items: impact.modifiedTrips,
      color: '#ed6c02',
    },
    {
      label: 'Added stops',
      items: impact.addedStops,
      color: '#2e7d32',
    },
    {
      label: 'Removed stops',
      items: impact.removedStops,
      color: '#d32f2f',
    },
  ].filter((s) => s.items.length > 0);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography
        variant='caption'
        fontWeight={700}
        sx={{ color: theme.palette.text.secondary, mb: 0.5, display: 'block' }}
      >
        Impact
      </Typography>
      {sections.map(({ label, items, color }) => (
        <Box key={label} sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mb: 0.5 }}>
          <Typography variant='caption' sx={{ color, fontWeight: 600, minWidth: 120 }}>
            {label}: {items.length}
          </Typography>
          {items.length <= 5 && (
            <Typography variant='caption' color='text.secondary'>
              {items.join(', ')}
            </Typography>
          )}
        </Box>
      ))}
      {impact.shapesChanged && (
        <Typography variant='caption' color='warning.main'>
          Shapes changed
        </Typography>
      )}
      {impact.servicePeriodsChanged && (
        <Typography variant='caption' color='warning.main' sx={{ ml: 1 }}>
          Service periods changed
        </Typography>
      )}
      {impact.headwayDelta != null && (
        <Typography
          variant='caption'
          sx={{
            ml: 1,
            color: impact.headwayDelta > 0 ? '#d32f2f' : '#2e7d32',
          }}
        >
          Headway: {impact.headwayDelta > 0 ? '+' : ''}
          {impact.headwayDelta} min
        </Typography>
      )}
    </Box>
  );
}

// ── Entity card ────────────────────────────────────────────────────

interface EntityCardProps<T> {
  diff: EntityDiffRecord<T>;
  renderSummary: (entity: T) => React.ReactNode;
  onViewFileDiff?: (entityKey: string) => void;
}

export default function EntityCard<T>({
  diff,
  renderSummary,
  onViewFileDiff,
}: EntityCardProps<T>): React.ReactElement {
  const entity = diff.newEntity ?? diff.oldEntity;
  const isRoute = diff.impact !== undefined;

  return (
    <Accordion
      disableGutters
      sx={{
        '&:before': { display: 'none' },
        border: '1px solid',
        borderColor: 'divider',
        mb: 0.5,
      }}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            width: '100%',
            flexWrap: 'wrap',
          }}
        >
          <DiffBadge type={diff.type} />
          <Typography variant='body2' fontWeight={600}>
            {diff.key}
          </Typography>
          {entity && (
            <Typography variant='caption' color='text.secondary'>
              {renderSummary(entity)}
            </Typography>
          )}
          {diff.type === 'modified' && (
            <Chip
              label={`${diff.changes.length} field${diff.changes.length !== 1 ? 's' : ''} changed`}
              size='small'
              variant='outlined'
              sx={{ fontSize: '0.65rem', height: 18, ml: 'auto' }}
            />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {diff.type === 'unchanged' && (
          <Typography variant='body2' color='text.secondary'>
            No changes detected.
          </Typography>
        )}
        {diff.type === 'added' && entity && (
          <Typography variant='body2' color='success.main'>
            New entity added.
          </Typography>
        )}
        {diff.type === 'deleted' && entity && (
          <Typography variant='body2' color='error.main'>
            Entity removed.
          </Typography>
        )}
        {diff.changes.length > 0 && (
          <Box sx={{ mb: 1 }}>
            {diff.changes.map((delta) => (
              <FieldChangeRow key={delta.field} delta={delta} />
            ))}
          </Box>
        )}
        {isRoute && diff.impact && (
          <>
            <Divider sx={{ my: 1 }} />
            <RouteImpactSection impact={diff.impact} />
          </>
        )}
        {onViewFileDiff && diff.type !== 'unchanged' && (
          <Box sx={{ mt: 1.5 }}>
            <Button
              size='small'
              variant='outlined'
              onClick={() => onViewFileDiff(diff.key)}
            >
              View raw file diff
            </Button>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
