'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
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
import {
  ChevronLeft,
  ChevronRight,
  Clear,
  Close,
  Search,
} from '@mui/icons-material';
import React, { useMemo, useState } from 'react';
import type {
  DayModifiedEntry,
  GtfsDate,
  RouteInfo,
} from '../../lib/entity-diff-types';
import {
  CHANGE_KINDS,
  type ChangeKind,
  exceptionLabel,
  formatGtfsDate,
  formatGtfsDateLong,
  modifiedEntryText,
} from '../../lib/calendar-utils';
import type { DayEntryRow } from '../../lib/calendar-query';
import {
  DAY_CATEGORY_LABELS,
  type DayChangeCategory,
  type DayEntryFilters,
  NO_DAY_ENTRY_FILTERS,
  dayEntryCategory,
  dayEntryCategoryCounts,
  filterDayEntries,
  isFilteringEntries,
} from '../../lib/service-detail';
import { type CalendarPalette, useCalendarPalette } from '../trips-v5/palette';
import { CountChange } from '../trips/shared';
import { MONO_FONT, RoutePreviewChips } from './shared';

const headSx = {
  fontWeight: 700,
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
  color: 'text.secondary',
} as const;
const cellSx = { fontSize: '0.8rem', py: 0.75, verticalAlign: 'top' } as const;

/** Rows shown before "Show more". */
const PAGE_ROWS = 100;

const SIGN: Record<ChangeKind, string> = {
  added: '+',
  removed: '−',
  modified: '~',
};

/** A category's colour: the change colours; gained / lost shades of them. */
export function categoryColor(
  palette: CalendarPalette,
  c: DayChangeCategory,
): string {
  switch (c) {
    case 'added':
    case 'gained':
      return palette.change.added;
    case 'removed':
    case 'lost':
      return palette.change.removed;
    default:
      return palette.change.modified;
  }
}

function pluralize(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

function CategoryChip({
  category,
  filled,
}: {
  category: DayChangeCategory;
  filled: boolean;
}): React.ReactElement {
  const color = categoryColor(useCalendarPalette(), category);
  // New / removed services are filled, kept ones outlined.
  return (
    <Box
      component='span'
      sx={{
        px: 0.75,
        height: 18,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '9px',
        fontSize: '0.68rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        border: '1px solid',
        borderColor: color,
        color: filled ? '#fff' : color,
        bgcolor: filled ? color : undefined,
      }}
    >
      {DAY_CATEGORY_LABELS[category]}
    </Box>
  );
}

/** What the change is, in words, and the exception in effect. */
function changeText(r: DayEntryRow, date: GtfsDate): string {
  if (r.kind === 'added') return r.patternNew;
  if (r.kind === 'removed') return `Was ${r.patternBase}`;
  return modifiedEntryText(r.entry as DayModifiedEntry, date).replace(
    /^[^:]*: /,
    '',
  );
}

function exceptionText(r: DayEntryRow): string | null {
  const e = r.entry.exception;
  if (e == null) return null;
  // A new or removed service has its exception in one feed only.
  if (r.kind === 'added') return `Exception: ${exceptionLabel(e.new)}`;
  if (r.kind === 'removed') return `Exception: ${exceptionLabel(e.base)}`;
  return e.base === e.new
    ? `Exception: ${exceptionLabel(e.new)}`
    : `Exception: ${exceptionLabel(e.base)} → ${exceptionLabel(e.new)}`;
}

function FilterBar({
  counts,
  filters,
  onChange,
}: {
  counts: Array<{ category: DayChangeCategory; count: number }>;
  filters: DayEntryFilters;
  onChange: (f: DayEntryFilters) => void;
}): React.ReactElement {
  const palette = useCalendarPalette();
  const shown = [
    ...counts,
    ...filters.categories
      .filter((c) => !counts.some((x) => x.category === c))
      .map((c) => ({ category: c, count: 0 })),
  ];
  const toggle = (c: DayChangeCategory): void =>
    onChange({
      ...filters,
      categories: filters.categories.includes(c)
        ? filters.categories.filter((x) => x !== c)
        : [...filters.categories, c],
    });
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
      <TextField
        size='small'
        placeholder='Search services or routes'
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        sx={{
          maxWidth: 420,
          '& .MuiOutlinedInput-root': { bgcolor: 'background.default' },
        }}
        slotProps={{
          htmlInput: { 'aria-label': 'Search services or routes' },
          input: {
            startAdornment: (
              <InputAdornment position='start'>
                <Search fontSize='small' />
              </InputAdornment>
            ),
            endAdornment: filters.search ? (
              <InputAdornment position='end'>
                <IconButton
                  size='small'
                  aria-label='Clear search'
                  onClick={() => onChange({ ...filters, search: '' })}
                >
                  <Clear fontSize='small' />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      {shown.length > 1 || filters.categories.length > 0 ? (
        <Box
          role='group'
          aria-label='Filter by change'
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          {shown.map(({ category: c, count }) => {
            const on = filters.categories.includes(c);
            const color = categoryColor(palette, c);
            return (
              <Chip
                key={c}
                size='small'
                clickable
                variant={on ? 'filled' : 'outlined'}
                aria-pressed={on}
                label={`${DAY_CATEGORY_LABELS[c]} ${count.toLocaleString()}`}
                onClick={() => toggle(c)}
                sx={{
                  fontWeight: 600,
                  borderColor: color,
                  color: on ? '#fff' : color,
                  bgcolor: on ? color : undefined,
                  '&&:hover': { bgcolor: on ? color : undefined },
                }}
              />
            );
          })}
          {isFilteringEntries(filters) ? (
            <Button
              size='small'
              onClick={() => onChange(NO_DAY_ENTRY_FILTERS)}
              sx={{ textTransform: 'none', ml: 0.5 }}
            >
              Clear filters
            </Button>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

function EntryRow({
  r,
  date,
  routes,
  onOpen,
}: {
  r: DayEntryRow;
  date: GtfsDate;
  routes: Record<string, RouteInfo>;
  onOpen: (serviceId: string) => void;
}): React.ReactElement {
  const category = dayEntryCategory(r);
  const exception = exceptionText(r);
  const reason =
    r.kind === 'modified' ? (r.entry as DayModifiedEntry).reason.detail : '';
  const pattern =
    r.kind === 'modified' && r.patternBase !== r.patternNew
      ? `${r.patternBase} → ${r.patternNew}`
      : r.kind === 'modified'
        ? r.patternNew
        : null;
  return (
    <TableRow
      hover
      tabIndex={0}
      onClick={() => onOpen(r.entry.service_id)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onOpen(r.entry.service_id);
      }}
      sx={{ cursor: 'pointer' }}
    >
      <TableCell sx={{ ...cellSx, minWidth: 200 }}>
        <Typography
          sx={{
            fontFamily: MONO_FONT,
            fontWeight: 700,
            fontSize: '0.8rem',
            overflowWrap: 'anywhere',
          }}
        >
          {r.entry.service_id}
        </Typography>
        {pattern ? (
          <Typography variant='caption' color='text.secondary' component='div'>
            {pattern}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell sx={{ ...cellSx, minWidth: 200 }}>
        <RoutePreviewChips routeIds={r.routeIds} routes={routes} />
      </TableCell>
      <TableCell sx={{ ...cellSx, minWidth: 260 }}>
        <CategoryChip
          category={category}
          filled={r.kind === 'added' || r.kind === 'removed'}
        />
        <Typography variant='body2' sx={{ fontSize: '0.8rem', mt: 0.5 }}>
          {changeText(r, date)}
        </Typography>
        {reason || exception ? (
          <Typography
            variant='caption'
            color='text.secondary'
            component='div'
            sx={{ fontFamily: reason ? MONO_FONT : undefined }}
          >
            {[reason, exception].filter(Boolean).join(' · ')}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>
        {r.kind === 'added' ? (
          r.trips.new.toLocaleString()
        ) : r.kind === 'removed' ? (
          r.trips.base.toLocaleString()
        ) : (
          <CountChange base={r.trips.base} next={r.trips.new} />
        )}
      </TableCell>
    </TableRow>
  );
}

interface DayDetailsDialogProps {
  date: GtfsDate | null;
  /** Changes on this date after filters are applied (undefined while loading). */
  entries: DayEntryRow[] | undefined;
  loading: boolean;
  /** Unfiltered change count, to show how many are hidden by filters. */
  unfilteredTotal: number;
  activeCounts: [number, number] | undefined;
  routes: Record<string, RouteInfo>;
  prevDate: GtfsDate | null;
  nextDate: GtfsDate | null;
  onNavigate: (date: GtfsDate) => void;
  onClose: () => void;
  /** Opens a service's page. */
  onOpenService: (serviceId: string) => void;
}

/**
 * The services changing on one date, like Trips' day popup: the day's
 * changes per kind, a search and a filter per kind of change, and one row
 * per service. A service opens its page.
 */
export default function DayDetailsDialog({
  date,
  entries,
  loading,
  unfilteredTotal,
  activeCounts,
  routes,
  prevDate,
  nextDate,
  onNavigate,
  onClose,
  onOpenService,
}: DayDetailsDialogProps): React.ReactElement {
  const palette = useCalendarPalette();
  // Kept while paging between days, cleared when the popup closes.
  const [filters, setFilters] = useState<DayEntryFilters>(NO_DAY_ENTRY_FILTERS);
  const [limit, setLimit] = useState(PAGE_ROWS);
  const [limitFor, setLimitFor] = useState(date);
  if (date !== limitFor) {
    setLimitFor(date);
    setLimit(PAGE_ROWS);
  }
  const close = (): void => {
    setFilters(NO_DAY_ENTRY_FILTERS);
    onClose();
  };

  const all = entries ?? [];
  const kindCounts = useMemo(() => {
    const c: Record<ChangeKind, number> = { added: 0, removed: 0, modified: 0 };
    for (const r of entries ?? []) c[r.kind]++;
    return c;
  }, [entries]);
  const categoryCounts = useMemo(
    () => dayEntryCategoryCounts(entries ?? []),
    [entries],
  );
  const rows = useMemo(
    () => filterDayEntries(entries ?? [], filters, routes),
    [entries, filters, routes],
  );
  const filtering = isFilteringEntries(filters);
  const hidden = entries ? unfilteredTotal - all.length : 0;

  return (
    <Dialog
      open={date != null}
      onClose={close}
      maxWidth='lg'
      fullWidth
      scroll='paper'
    >
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}
      >
        <Tooltip
          title={
            prevDate
              ? `Previous change: ${formatGtfsDate(prevDate)}`
              : 'No earlier change'
          }
        >
          <span>
            <IconButton
              size='small'
              disabled={prevDate == null}
              onClick={() => prevDate && onNavigate(prevDate)}
              aria-label='Previous changed day'
            >
              <ChevronLeft />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant='h6' component='div' fontWeight={700}>
            {date ? formatGtfsDateLong(date) : ''}
          </Typography>
          {activeCounts ? (
            <Typography variant='caption' color='text.secondary'>
              {activeCounts[0] + activeCounts[1] === 0
                ? 'No service in either feed'
                : `${pluralize(activeCounts[0], 'active service')} before → ${activeCounts[1].toLocaleString()} after`}
            </Typography>
          ) : null}
        </Box>
        <Tooltip
          title={
            nextDate
              ? `Next change: ${formatGtfsDate(nextDate)}`
              : 'No later change'
          }
        >
          <span>
            <IconButton
              size='small'
              disabled={nextDate == null}
              onClick={() => nextDate && onNavigate(nextDate)}
              aria-label='Next changed day'
            >
              <ChevronRight />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton size='small' onClick={close} aria-label='Close'>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            mb: 2,
          }}
        >
          <Box
            sx={{ display: 'flex', gap: 1, fontWeight: 700, fontSize: '1rem' }}
            aria-label='Services changed'
          >
            {CHANGE_KINDS.filter((k) => kindCounts[k] > 0).map((k) => (
              <Tooltip key={k} title={`Services ${k}`}>
                <Box component='span' sx={{ color: palette.change[k] }}>
                  {SIGN[k]}
                  {kindCounts[k].toLocaleString()}
                </Box>
              </Tooltip>
            ))}
          </Box>
          {activeCounts ? (
            <Typography variant='body2' color='text.secondary'>
              Services{' '}
              <CountChange base={activeCounts[0]} next={activeCounts[1]} />
            </Typography>
          ) : null}
        </Box>
        {hidden > 0 ? (
          <Alert severity='info' sx={{ mb: 2 }}>
            {pluralize(hidden, 'change')} on this day hidden by the calendar
            filters.
          </Alert>
        ) : null}
        {loading && entries == null ? (
          <LinearProgress />
        ) : entries != null && all.length === 0 ? (
          <Typography color='text.secondary'>
            No changes on this day for the current filters.
          </Typography>
        ) : (
          <>
            <FilterBar
              counts={categoryCounts}
              filters={filters}
              onChange={setFilters}
            />
            {filtering ? (
              <Typography
                variant='caption'
                color='text.secondary'
                component='p'
                sx={{ mb: 0.5 }}
              >
                {rows.length.toLocaleString()} of {all.length.toLocaleString()}{' '}
                services match
              </Typography>
            ) : null}
            <Table size='small' stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Service</TableCell>
                  <TableCell sx={headSx}>Routes</TableCell>
                  <TableCell sx={headSx}>Change</TableCell>
                  <TableCell sx={headSx}>Trips</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.slice(0, limit).map((r) => (
                  <EntryRow
                    key={`${r.kind}-${r.entry.service_id}`}
                    r={r}
                    date={date ?? ''}
                    routes={routes}
                    onOpen={onOpenService}
                  />
                ))}
                {filtering && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ ...cellSx, py: 2 }}>
                      <Typography variant='body2' color='text.secondary'>
                        No services match the filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            {rows.length > limit ? (
              <Button
                size='small'
                onClick={() => setLimit((l) => l + PAGE_ROWS)}
                sx={{ mt: 1, textTransform: 'none' }}
              >
                Show {Math.min(PAGE_ROWS, rows.length - limit)} more of{' '}
                {(rows.length - limit).toLocaleString()}
              </Button>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
