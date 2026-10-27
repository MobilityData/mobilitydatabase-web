'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ErrorOutline, ExpandMore, WarningAmber } from '@mui/icons-material';
import React from 'react';
import { Link } from '../../../../../i18n/navigation';
import type { GlobalHighlight } from '../../lib/global-highlights';
import type { HighlightSeverity } from '../../lib/highlights';
import {
  entityHighlightHref,
  entityRowHref,
  sectionPageHref,
  tripsRawDiffHref,
} from '../../lib/highlight-links';
import { tripsRouteHref } from '../../lib/trips-v2-routes';
import { formatGtfsDate } from '../../lib/calendar-utils';

export const SEVERITY_COLORS: Record<HighlightSeverity, string> = {
  error: '#d32f2f',
  warning: '#ed6c02',
};

const MONO = 'var(--font-ibm-plex-mono)';
const cellSx = { fontSize: '0.78rem', py: 0.5 } as const;
const linkSx = {
  color: 'primary.main',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  '&:hover': { textDecoration: 'underline' },
} as const;

export function SeverityIcon({
  severity,
}: {
  severity: HighlightSeverity;
}): React.ReactElement {
  const sx = { color: SEVERITY_COLORS[severity], fontSize: 22, mt: 0.1 };
  return severity === 'error' ? (
    <ErrorOutline sx={sx} titleAccess='Critical' />
  ) : (
    <WarningAmber sx={sx} titleAccess='Warning' />
  );
}

interface HighlightRowProps {
  highlight: GlobalHighlight;
  datasetId: string;
  sectionLabel: string;
}

/**
 * One highlight of the ranking, expandable to the entities behind it (each
 * linking to its page). Details mount only when the row is opened.
 */
export default function HighlightRow({
  highlight: h,
  datasetId,
  sectionLabel,
}: HighlightRowProps): React.ReactElement {
  const expandable = h.entities != null;
  return (
    <Accordion
      disableGutters
      variant='outlined'
      slotProps={{ transition: { unmountOnExit: true } }}
      sx={{
        borderColor: SEVERITY_COLORS[h.severity],
        borderRadius: '4px',
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={expandable ? <ExpandMore /> : null}
        sx={{
          cursor: expandable ? 'pointer' : 'default',
          '& .MuiAccordionSummary-content': {
            my: 1.25,
            gap: 1.5,
            alignItems: 'flex-start',
            minWidth: 0,
          },
        }}
      >
        <SeverityIcon severity={h.severity} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant='body2' fontWeight={700}>
            {h.title}
          </Typography>
          {h.detail ? (
            <Typography variant='body2' color='text.secondary'>
              {h.detail}
            </Typography>
          ) : null}
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 0.25,
            flexShrink: 0,
          }}
        >
          <Typography
            component={Link}
            href={entityHighlightHref(datasetId, h.section, h.id)}
            variant='body2'
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={linkSx}
          >
            {sectionLabel} →
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            #{h.rank}
          </Typography>
        </Box>
      </AccordionSummary>
      {expandable ? (
        <AccordionDetails sx={{ pt: 0 }}>
          <HighlightDetails
            highlight={h}
            datasetId={datasetId}
            sectionLabel={sectionLabel}
          />
        </AccordionDetails>
      ) : null}
    </Accordion>
  );
}

/** What a highlight expands to: its entities, each opening its page. */
export function HighlightDetails({
  highlight: h,
  datasetId,
  sectionLabel,
}: HighlightRowProps): React.ReactElement | null {
  const e = h.entities;
  if (e == null) return null;
  if (e.kind === 'list') {
    const more = e.total - e.rows.length;
    return (
      <Box>
        <Table size='small' aria-label={`Entities behind: ${h.title}`}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...cellSx, fontWeight: 700 }}>Id</TableCell>
              <TableCell sx={{ ...cellSx, fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ ...cellSx, fontWeight: 700 }}>
                What changed
              </TableCell>
              <TableCell sx={cellSx} />
            </TableRow>
          </TableHead>
          <TableBody>
            {e.rows.map((r) => (
              <TableRow key={`${r.id}-${r.openId ?? ''}`}>
                <TableCell sx={{ ...cellSx, fontFamily: MONO }}>
                  {r.id}
                </TableCell>
                <TableCell sx={cellSx}>{r.label}</TableCell>
                <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>
                  {r.note}
                </TableCell>
                <TableCell sx={cellSx} align='right'>
                  {e.of === 'date' ? null : (
                    <Typography
                      component={Link}
                      href={entityRowHref(datasetId, h.section, e.of, r)}
                      variant='caption'
                      sx={linkSx}
                    >
                      Open →
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {more > 0 ? (
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ display: 'block', mt: 1 }}
          >
            And {more.toLocaleString()} more:{' '}
            <Typography
              component={Link}
              href={sectionPageHref(datasetId, h.section)}
              variant='caption'
              sx={linkSx}
            >
              see all on the {sectionLabel} page →
            </Typography>
          </Typography>
        ) : null}
      </Box>
    );
  }
  if (e.kind === 'routes')
    return (
      <Table size='small' aria-label={`Routes behind: ${h.title}`}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...cellSx, fontWeight: 700 }}>Route</TableCell>
            <TableCell sx={{ ...cellSx, fontWeight: 700 }} align='right'>
              Trips before
            </TableCell>
            <TableCell sx={{ ...cellSx, fontWeight: 700 }} align='right'>
              Trips after
            </TableCell>
            <TableCell sx={cellSx} />
          </TableRow>
        </TableHead>
        <TableBody>
          {e.routes.map((r) => (
            <TableRow key={r.route}>
              <TableCell sx={{ ...cellSx, fontFamily: MONO }}>
                {r.route}
              </TableCell>
              <TableCell sx={cellSx} align='right'>
                {r.base.toLocaleString()}
              </TableCell>
              <TableCell sx={cellSx} align='right'>
                {r.new.toLocaleString()}
              </TableCell>
              <TableCell sx={cellSx} align='right'>
                <Typography
                  component={Link}
                  href={tripsRouteHref(datasetId, r.route, {
                    view: 'trips-v3',
                  })}
                  variant='caption'
                  sx={linkSx}
                >
                  Open →
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  if (e.kind === 'rows')
    return (
      <Typography variant='body2' color='text.secondary'>
        {e.count.toLocaleString()} rows of {e.file}.{' '}
        <Typography
          component={Link}
          href={tripsRawDiffHref(datasetId)}
          variant='body2'
          sx={linkSx}
        >
          Open the raw diff →
        </Typography>
      </Typography>
    );
  // Dates: each feed's service period.
  const range = (r: { min: string | null; max: string | null }): string =>
    r.min && r.max
      ? `${formatGtfsDate(r.min)} – ${formatGtfsDate(r.max)}`
      : 'no service';
  return (
    <Typography variant='body2' color='text.secondary'>
      Before: {range(e.base)}. After: {range(e.new)}.
    </Typography>
  );
}
