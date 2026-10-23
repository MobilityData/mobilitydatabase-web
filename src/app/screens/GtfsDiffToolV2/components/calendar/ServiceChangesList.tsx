'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Clear, ExpandMore, Search } from '@mui/icons-material';
import React, { useState } from 'react';
import type {
  DiffType,
  GtfsDate,
  MapTable,
  RouteInfo,
  ServiceDiff,
  ServiceSnapshot,
} from '../../lib/entity-diff-types';
import {
  type ServiceListFilters,
  type ServiceListRow,
  serviceDetailQuery,
  serviceStatusCountsQuery,
  servicesPageQuery,
  toServiceListRow,
} from '../../lib/calendar-query';
import {
  mapDetailUrl,
  mapTableUrl,
  queryMapTable,
  useMapTableQuery,
} from '../../lib/useMapTable';
import SegmentedList from '../diffmap/SegmentedList';
import {
  WEEKDAY_SHORT,
  exceptionLabel,
  formatGtfsDate,
  weekdayFlags,
} from '../../lib/calendar-utils';
import SummaryStatBar from '../../../GtfsDiffTool/components/SummaryStatBar';
import { DiffBadge } from '../../../GtfsDiffTool/components/EntityCard';
import { MONO_FONT, RouteChips, serviceAnchorId } from './shared';

const DATE_CHIP_LIMIT = 24;
const NO_STATUS_COUNTS: Record<DiffType, number> = {
  added: 0,
  deleted: 0,
  modified: 0,
  unchanged: 0,
};

function periodText(s: ServiceSnapshot | null): string {
  if (s == null) return '—';
  if (s.calendar)
    return `${formatGtfsDate(s.calendar.start_date)} – ${formatGtfsDate(s.calendar.end_date)}`;
  return `${s.active_day_count} specific dates`;
}

/** Seven weekday boxes comparing base vs new regular pattern. */
function WeekdayPattern({
  service,
}: {
  service: ServiceDiff;
}): React.ReactElement {
  const b = weekdayFlags(service.base?.calendar);
  const n = weekdayFlags(service.new?.calendar);
  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      {WEEKDAY_SHORT.map((w, i) => {
        const before = service.base != null && b[i];
        const after = service.new != null && n[i];
        const gained = !before && after && service.base != null;
        const lost = before && !after && service.new != null;
        const color = gained ? '#2e7d32' : lost ? '#d32f2f' : undefined;
        return (
          <Tooltip
            key={w}
            title={
              gained
                ? `Now runs on ${w}`
                : lost
                  ? `No longer runs on ${w}`
                  : after || before
                    ? `Runs on ${w}`
                    : `No regular ${w} service`
            }
          >
            <Box
              sx={{
                width: 34,
                py: 0.25,
                textAlign: 'center',
                borderRadius: '4px',
                fontSize: '0.7rem',
                fontWeight: 700,
                border: '1px solid',
                borderColor: color ?? 'divider',
                bgcolor:
                  color ??
                  (after || before ? 'action.selected' : 'transparent'),
                color: color
                  ? '#fff'
                  : after || before
                    ? 'text.primary'
                    : 'text.disabled',
                textDecoration: lost ? 'line-through' : undefined,
              }}
            >
              {w}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function DateChips({
  label,
  dates,
  color,
  onDateClick,
}: {
  label: string;
  dates: GtfsDate[];
  color: string;
  onDateClick: (d: GtfsDate) => void;
}): React.ReactElement | null {
  const [showAll, setShowAll] = useState(false);
  if (dates.length === 0) return null;
  const visible = showAll ? dates : dates.slice(0, DATE_CHIP_LIMIT);
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant='caption' fontWeight={700} sx={{ color }}>
        {label} ({dates.length})
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
        {visible.map((d) => (
          <Chip
            key={d}
            size='small'
            label={formatGtfsDate(d)}
            onClick={() => onDateClick(d)}
            sx={{ height: 22, fontSize: '0.68rem', color, borderColor: color }}
            variant='outlined'
          />
        ))}
        {dates.length > DATE_CHIP_LIMIT && (
          <Chip
            size='small'
            label={
              showAll ? 'Show fewer' : `+${dates.length - DATE_CHIP_LIMIT} more`
            }
            onClick={() => setShowAll((s) => !s)}
            sx={{ height: 22, fontSize: '0.68rem' }}
          />
        )}
      </Box>
    </Box>
  );
}

const cellSx = { fontFamily: MONO_FONT, fontSize: '0.72rem', py: 0.5 };

function ServiceDetails({
  service,
  onDateClick,
  onShowOnCalendar,
}: {
  service: ServiceDiff;
  onDateClick: (d: GtfsDate) => void;
  onShowOnCalendar: (serviceId: string) => void;
}): React.ReactElement {
  const ex = service.exception_changes;
  const exceptionRows = [
    ...ex.added.map((e) => ({
      date: e.date,
      change: 'Added',
      base: null,
      next: e.exception_type,
      color: '#2e7d32',
    })),
    ...ex.removed.map((e) => ({
      date: e.date,
      change: 'Removed',
      base: e.exception_type,
      next: null,
      color: '#d32f2f',
    })),
    ...ex.modified.map((e) => ({
      date: e.date,
      change: 'Changed',
      base: e.base_exception_type,
      next: e.new_exception_type,
      color: '#ed6c02',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box>
          <Typography
            variant='caption'
            color='text.secondary'
            component='div'
            sx={{ mb: 0.5 }}
          >
            Regular weekly pattern
          </Typography>
          <WeekdayPattern service={service} />
        </Box>
        <Box>
          <Typography variant='caption' color='text.secondary' component='div'>
            Service period
          </Typography>
          <Typography variant='body2'>
            {service.status === 'added'
              ? periodText(service.new)
              : service.status === 'deleted'
                ? periodText(service.base)
                : `${periodText(service.base)} → ${periodText(service.new)}`}
          </Typography>
        </Box>
        <Box>
          <Typography variant='caption' color='text.secondary' component='div'>
            Active days · trips
          </Typography>
          <Typography variant='body2'>
            {service.base?.active_day_count ?? 0} →{' '}
            {service.new?.active_day_count ?? 0} days ·{' '}
            {service.trip_counts.base} → {service.trip_counts.new} trips
          </Typography>
        </Box>
      </Box>

      {service.calendar_field_changes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant='caption'
            fontWeight={700}
            component='div'
            sx={{ mb: 0.5 }}
          >
            calendar.txt changes
          </Typography>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Field</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Before</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>After</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {service.calendar_field_changes.map((c) => (
                <TableRow key={c.field}>
                  <TableCell sx={cellSx}>{c.field}</TableCell>
                  <TableCell sx={{ ...cellSx, color: '#d32f2f' }}>
                    {c.base_value || '—'}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: '#2e7d32' }}>
                    {c.new_value || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {exceptionRows.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant='caption'
            fontWeight={700}
            component='div'
            sx={{ mb: 0.5 }}
          >
            calendar_dates.txt changes
          </Typography>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Change</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Before</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>After</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {exceptionRows.map((r) => (
                <TableRow
                  key={r.date}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onDateClick(r.date)}
                >
                  <TableCell sx={cellSx}>{formatGtfsDate(r.date)}</TableCell>
                  <TableCell
                    sx={{ ...cellSx, color: r.color, fontWeight: 700 }}
                  >
                    {r.change}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    {r.base ? exceptionLabel(r.base) : '—'}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    {r.next ? exceptionLabel(r.next) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <DateChips
        label='Now runs on'
        dates={service.dates_gained}
        color='#2e7d32'
        onDateClick={onDateClick}
      />
      <DateChips
        label='No longer runs on'
        dates={service.dates_lost}
        color='#d32f2f'
        onDateClick={onDateClick}
      />

      <Button
        size='small'
        variant='outlined'
        onClick={() => onShowOnCalendar(service.service_id)}
      >
        Show on calendar
      </Button>
    </Box>
  );
}

/** An expanded service: its full row is read from the table on demand. */
function ServiceDetailsLoader({
  url,
  serviceId,
  onDateClick,
  onShowOnCalendar,
}: {
  url: string;
  serviceId: string;
  onDateClick: (d: GtfsDate) => void;
  onShowOnCalendar: (serviceId: string) => void;
}): React.ReactElement {
  const detail = useMapTableQuery(
    url,
    serviceId,
    (v) => serviceDetailQuery(v, serviceId),
    (rows) =>
      rows[0] ? (JSON.parse(String(rows[0].detail)) as ServiceDiff) : null,
  );
  if (detail.error)
    return <Alert severity='error'>{detail.error.message}</Alert>;
  if (detail.data?.service_id !== serviceId) return <LinearProgress />;
  return (
    <ServiceDetails
      service={detail.data}
      onDateClick={onDateClick}
      onShowOnCalendar={onShowOnCalendar}
    />
  );
}

interface ServiceChangesListProps {
  datasetId: string;
  /** calendar/services.parquet */
  table: MapTable;
  /** The calendar's service and line filters. */
  serviceIds: string[];
  routeIds: string[];
  /** A service opened from elsewhere: the list shows it alone, expanded. */
  focusId: string | null;
  onClearFocus: () => void;
  routes: Record<string, RouteInfo>;
  expandedId: string | null;
  onExpandedChange: (serviceId: string | null) => void;
  onDateClick: (date: GtfsDate) => void;
  onShowOnCalendar: (serviceId: string) => void;
}

/**
 * The services, read from Parquet a segment at a time with virtual scroll
 * (IDFM: 10,816), filtered by the calendar filters, a status and a search
 * on the service_id.
 */
export default function ServiceChangesList({
  datasetId,
  table,
  serviceIds,
  routeIds,
  focusId,
  onClearFocus,
  routes,
  expandedId,
  onExpandedChange,
  onDateClick,
  onShowOnCalendar,
}: ServiceChangesListProps): React.ReactElement {
  const url = mapTableUrl(datasetId, table);
  const [status, setStatus] = useState<DiffType | null>(null);
  const [search, setSearch] = useState('');
  const filters: ServiceListFilters = focusId
    ? { serviceIds: [focusId], routeIds: [], status: null, search: '' }
    : { serviceIds, routeIds, status, search };
  const filterKey = JSON.stringify(filters);
  const countsQ = useMapTableQuery(
    url,
    JSON.stringify({ ...filters, status: null }),
    (v) => serviceStatusCountsQuery(v, filters),
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
    queryMapTable(url, (v) =>
      servicesPageQuery(v, filters, offset, limit),
    ).then((rows) => rows.map(toServiceListRow));

  const renderRow = (s: ServiceListRow): React.ReactElement => {
    const expanded = expandedId === s.service_id;
    return (
      <Accordion
        id={serviceAnchorId(s.service_id)}
        expanded={expanded}
        onChange={(_, open) => onExpandedChange(open ? s.service_id : null)}
        disableGutters
        slotProps={{ transition: { unmountOnExit: true } }}
        sx={{
          mb: 1,
          scrollMarginTop: 80,
          border: '1px solid',
          borderColor: expanded ? 'primary.main' : 'divider',
          boxShadow: 'none',
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            <DiffBadge type={s.status} />
            <Typography
              sx={{
                fontFamily: MONO_FONT,
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              {s.service_id}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {s.pattern}
            </Typography>
            <RouteChips routeIds={s.routeIds} routes={routes} />
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              {s.gained > 0 && (
                <Typography
                  variant='caption'
                  sx={{ color: '#2e7d32', fontWeight: 700 }}
                >
                  +{s.gained} day{s.gained === 1 ? '' : 's'}
                </Typography>
              )}
              {s.lost > 0 && (
                <Typography
                  variant='caption'
                  sx={{ color: '#d32f2f', fontWeight: 700 }}
                >
                  −{s.lost} day{s.lost === 1 ? '' : 's'}
                </Typography>
              )}
            </Box>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <ServiceDetailsLoader
            url={mapDetailUrl(datasetId, table)}
            serviceId={s.service_id}
            onDateClick={onDateClick}
            onShowOnCalendar={onShowOnCalendar}
          />
        </AccordionDetails>
      </Accordion>
    );
  };

  return (
    <Box>
      {focusId ? (
        <Alert
          severity='info'
          sx={{ mb: 2 }}
          action={
            <Button color='inherit' size='small' onClick={onClearFocus}>
              Show all services
            </Button>
          }
        >
          Showing service <b>{focusId}</b> only.
        </Alert>
      ) : (
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
      )}
      <Box
        sx={{
          mt: 2,
          // Virtual scroll needs its own scrolling box; one service alone
          // doesn't.
          height: focusId ? 'auto' : 'min(70vh, 720px)',
          minHeight: focusId ? 0 : 240,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <SegmentedList<ServiceListRow>
          queryKey={`${url}|${filterKey}`}
          total={total}
          loading={countsQ.loading}
          fetchRows={fetchRows}
          rowKey={(s) => s.service_id}
          renderRow={renderRow}
          emptyText='No services match the current filters.'
        />
      </Box>
    </Box>
  );
}
