'use client';

import {
  Box,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import { Clear, Search } from '@mui/icons-material';
import React, { useState } from 'react';
import { Link } from '../../../../../i18n/navigation';
import type { DiffType, RouteInfo } from '../../lib/entity-diff-types';
import {
  type ServiceListFilters,
  type ServiceListRow,
  serviceStatusCountsQuery,
  servicesPageQuery,
  toServiceListRow,
} from '../../lib/calendar-query';
import {
  type CalendarUrls,
  calendarKey,
  queryCalendar,
  useCalendarQuery,
} from '../../lib/useCalendarTables';
import { serviceHref } from '../../lib/service-detail';
import SegmentedList from '../diffmap/SegmentedList';
import SummaryStatBar from '../../../GtfsDiffTool/components/SummaryStatBar';
import { useCalendarPalette } from '../trips-v5/palette';
import { MONO_FONT, RoutePreviewChips, StatusDot } from './shared';

const NO_STATUS_COUNTS: Record<DiffType, number> = {
  added: 0,
  deleted: 0,
  modified: 0,
  unchanged: 0,
};

/** Service, routes, trips, active days. */
const GRID_COLUMNS =
  'minmax(220px, 1.3fr) minmax(220px, 2fr) minmax(100px, 0.5fr) minmax(140px, 0.7fr)';

const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: GRID_COLUMNS },
  columnGap: 2,
  rowGap: 0.5,
  px: 1.5,
} as const;

const HEAD_SX = {
  fontWeight: 700,
  fontSize: '0.875rem',
  whiteSpace: 'nowrap',
} as const;

/** "10", "31 → 10": a count in the feeds the service is in. */
export function countText(
  status: DiffType,
  { base, new: next }: { base: number; new: number },
): string {
  if (status === 'added') return next.toLocaleString();
  if (status === 'deleted') return base.toLocaleString();
  return base === next
    ? next.toLocaleString()
    : `${base.toLocaleString()} → ${next.toLocaleString()}`;
}

function ServiceRow({
  datasetId,
  s,
  routes,
}: {
  datasetId: string;
  s: ServiceListRow;
  routes: Record<string, RouteInfo>;
}): React.ReactElement {
  const { change } = useCalendarPalette();
  return (
    <Box
      component={Link}
      href={serviceHref(datasetId, s.service_id)}
      sx={{
        ...GRID_SX,
        py: 1,
        alignItems: 'start',
        color: 'inherit',
        textDecoration: 'none',
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: -2,
        },
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
        <Box component='span' sx={{ pt: '5px' }}>
          <StatusDot status={s.status} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: MONO_FONT,
              fontWeight: 700,
              fontSize: '0.85rem',
              overflowWrap: 'anywhere',
            }}
          >
            {s.service_id}
          </Typography>
          <Typography variant='caption' color='text.secondary' component='div'>
            {s.pattern}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ pt: { md: '2px' } }}>
        <RoutePreviewChips routeIds={s.routeIds} routes={routes} />
      </Box>
      <Typography variant='body2' sx={{ textAlign: { md: 'right' } }}>
        {countText(s.status, s.trips)}{' '}
        <Box component='span' sx={{ display: { md: 'none' } }}>
          trips
        </Box>
      </Typography>
      <Box sx={{ textAlign: { md: 'right' } }}>
        <Typography variant='body2'>
          {countText(s.status, s.activeDays)}{' '}
          <Box component='span' sx={{ display: { md: 'none' } }}>
            days
          </Box>
        </Typography>
        {s.gained + s.lost > 0 ? (
          <Typography
            variant='caption'
            component='div'
            sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {s.gained > 0 ? (
              <Box component='span' sx={{ color: change.added }}>
                +{s.gained}
              </Box>
            ) : null}
            {s.gained > 0 && s.lost > 0 ? ' ' : null}
            {s.lost > 0 ? (
              <Box component='span' sx={{ color: change.removed }}>
                −{s.lost}
              </Box>
            ) : null}{' '}
            <Box component='span' sx={{ color: 'text.secondary' }}>
              days
            </Box>
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

interface ServiceChangesListProps {
  datasetId: string;
  /** The calendar's tables (lib/useCalendarTables). */
  urls: CalendarUrls;
  /** The calendar's service and line filters. */
  serviceIds: string[];
  routeIds: string[];
  routes: Record<string, RouteInfo>;
}

/**
 * The services as a list, like Trips' service period groups: status,
 * service_id and weekly pattern, the first routes, trips and active days.
 * A row opens the service's page. Read from Parquet a segment at a time
 * with virtual scroll (IDFM: 10,816), filtered by the calendar filters, a
 * status and a search on the service_id.
 */
export default function ServiceChangesList({
  datasetId,
  urls,
  serviceIds,
  routeIds,
  routes,
}: ServiceChangesListProps): React.ReactElement {
  const tablesKey = calendarKey(urls);
  const [status, setStatus] = useState<DiffType | null>(null);
  const [search, setSearch] = useState('');
  const filters: ServiceListFilters = { serviceIds, routeIds, status, search };
  const filterKey = JSON.stringify(filters);
  const countsQ = useCalendarQuery(
    urls,
    JSON.stringify({ ...filters, status: null }),
    (v) => serviceStatusCountsQuery(v.services, filters),
    (rows) => {
      const c = { ...NO_STATUS_COUNTS };
      for (const r of rows) c[r.status as DiffType] = Number(r.n);
      return c;
    },
  );
  const counts = countsQ.data ?? NO_STATUS_COUNTS;
  const total = filters.status
    ? counts[filters.status]
    : Object.values(counts).reduce((a, b) => a + b, 0);
  const fetchRows = (
    offset: number,
    limit: number,
  ): Promise<ServiceListRow[]> =>
    queryCalendar(urls, (v) =>
      servicesPageQuery(v, filters, offset, limit),
    ).then((rows) => rows.map(toServiceListRow));

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <SummaryStatBar
          counts={counts}
          activeFilter={status}
          onFilterClick={setStatus}
        />
        <TextField
          size='small'
          placeholder='Search service_id…'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 260, flex: '0 1 320px' }}
          slotProps={{
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
                    <Clear fontSize='small' />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        <Typography variant='caption' color='text.secondary'>
          {total.toLocaleString()} service{total === 1 ? '' : 's'}
        </Typography>
      </Box>
      <Box
        sx={{
          ...GRID_SX,
          display: { xs: 'none', md: 'grid' },
          mt: 2,
          py: 0.75,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography sx={HEAD_SX}>Service</Typography>
        <Typography sx={HEAD_SX}>Routes</Typography>
        <Typography
          sx={{ ...HEAD_SX, textAlign: 'right' }}
          title='Trips running on the service, before → after'
        >
          Trips
        </Typography>
        <Typography
          sx={{ ...HEAD_SX, textAlign: 'right' }}
          title='Days the service runs, before → after; days gained and lost'
        >
          Active days
        </Typography>
      </Box>
      <Box
        sx={{
          // Virtual scroll needs its own scrolling box.
          height: 'min(70vh, 720px)',
          minHeight: 240,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <SegmentedList<ServiceListRow>
          queryKey={`${tablesKey}|${filterKey}`}
          total={total}
          loading={countsQ.loading}
          fetchRows={fetchRows}
          rowKey={(s) => s.service_id}
          renderRow={(s) => (
            <ServiceRow datasetId={datasetId} s={s} routes={routes} />
          )}
          emptyText='No services match the current filters.'
        />
      </Box>
    </Box>
  );
}
