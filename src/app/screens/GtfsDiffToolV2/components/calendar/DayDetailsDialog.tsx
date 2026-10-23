'use client';

import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  Tooltip,
  Typography,
} from '@mui/material';
import { ChevronLeft, ChevronRight, Close } from '@mui/icons-material';
import React from 'react';
import type {
  DayException,
  DayModifiedEntry,
  GtfsDate,
  RouteInfo,
} from '../../lib/entity-diff-types';
import {
  CHANGE_COLORS,
  CHANGE_KINDS,
  type ChangeKind,
  exceptionLabel,
  formatGtfsDate,
  formatGtfsDateLong,
  modifiedEntryText,
} from '../../lib/calendar-utils';
import type { DayEntryRow } from '../../lib/calendar-query';
import SegmentedList from '../diffmap/SegmentedList';
import { MONO_FONT, RouteChips, ServiceIdLink } from './shared';

const SECTION_TITLES: Record<ChangeKind, string> = {
  added: 'Added services',
  removed: 'Removed services',
  modified: 'Modified services',
};

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Days with more changes than this list them with virtual scroll. */
const PLAIN_LIST_MAX = 150;

/** A section title or a change, in the dialog's (virtual) list. */
type DialogRow =
  | { type: 'section'; kind: ChangeKind; count: number; first: boolean }
  | { type: 'entry'; row: DayEntryRow };

function ExceptionChip({
  exception,
}: {
  exception: DayException | null;
}): React.ReactElement | null {
  if (exception == null) return null;
  const label =
    exception.base === exception.new
      ? `Exception: ${exceptionLabel(exception.new)}`
      : `Exception: ${exceptionLabel(exception.base)} → ${exceptionLabel(exception.new)}`;
  return (
    <Chip
      size='small'
      variant='outlined'
      label={label}
      sx={{ height: 20, fontSize: '0.68rem' }}
    />
  );
}

interface DayDetailsDialogProps {
  date: GtfsDate | null;
  /** Changes on this date after filters are applied (undefined while loading). */
  entries: DayEntryRow[] | undefined;
  /** Changes whenever `entries` are re-queried (date + filters). */
  entriesKey: string;
  loading: boolean;
  /** Unfiltered change count, to show how many are hidden by filters. */
  unfilteredTotal: number;
  activeCounts: [number, number] | undefined;
  routes: Record<string, RouteInfo>;
  prevDate: GtfsDate | null;
  nextDate: GtfsDate | null;
  onNavigate: (date: GtfsDate) => void;
  onClose: () => void;
  onServiceClick: (serviceId: string) => void;
}

export default function DayDetailsDialog({
  date,
  entries,
  entriesKey,
  loading,
  unfilteredTotal,
  activeCounts,
  routes,
  prevDate,
  nextDate,
  onNavigate,
  onClose,
  onServiceClick,
}: DayDetailsDialogProps): React.ReactElement {
  const total = entries?.length ?? 0;
  const hidden = entries ? unfilteredTotal - total : 0;

  const renderEntry = ({
    kind,
    entry: e,
    routeIds,
    patternBase,
    patternNew,
    trips,
  }: DayEntryRow): React.ReactElement => {
    let description: string;
    if (kind === 'added')
      description = `New service · ${patternNew} · ${pluralize(trips.new, 'trip')}`;
    else if (kind === 'removed')
      description = `Service removed · was ${patternBase} · ${pluralize(trips.base, 'trip')}`;
    else description = modifiedEntryText(e as DayModifiedEntry, date ?? '');
    const detail =
      kind === 'modified' ? (e as DayModifiedEntry).reason.detail : null;

    return (
      <ListItem
        key={`${kind}-${e.service_id}`}
        disableGutters
        sx={{ display: 'block', py: 1 }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            mb: 0.5,
          }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '2px',
              bgcolor: CHANGE_COLORS[kind],
              flexShrink: 0,
            }}
          />
          <ServiceIdLink serviceId={e.service_id} onClick={onServiceClick} />
          <RouteChips routeIds={routeIds} routes={routes} />
          <ExceptionChip exception={e.exception} />
        </Box>
        <Typography variant='body2' sx={{ pl: 2.25 }}>
          {description}
        </Typography>
        {detail && (
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ pl: 2.25, fontFamily: MONO_FONT, display: 'block' }}
          >
            {detail}
          </Typography>
        )}
        {kind === 'modified' && (patternBase || patternNew) && (
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ pl: 2.25, display: 'block' }}
          >
            Pattern: {patternBase} → {patternNew}
          </Typography>
        )}
      </ListItem>
    );
  };

  // Sections (added, removed, modified) as one list: a title row, then
  // its changes (entries come sorted by kind).
  const rows: DialogRow[] = [];
  for (const kind of CHANGE_KINDS) {
    const list = (entries ?? []).filter((r) => r.kind === kind);
    if (list.length === 0) continue;
    rows.push({
      type: 'section',
      kind,
      count: list.length,
      first: rows.length === 0,
    });
    for (const row of list) rows.push({ type: 'entry', row });
  }
  const renderRow = (r: DialogRow): React.ReactElement =>
    r.type === 'section' ? (
      <Box key={`section-${r.kind}`} sx={{ mt: r.first ? 0 : 2 }}>
        {!r.first && <Divider sx={{ mb: 2 }} />}
        <Typography
          variant='subtitle2'
          fontWeight={700}
          sx={{ color: CHANGE_COLORS[r.kind] }}
        >
          {SECTION_TITLES[r.kind]} ({r.count})
        </Typography>
      </Box>
    ) : (
      renderEntry(r.row)
    );
  const rowKey = (r: DialogRow): string =>
    r.type === 'section'
      ? `section-${r.kind}`
      : `${r.row.kind}-${r.row.entry.service_id}`;

  return (
    <Dialog
      open={date != null}
      onClose={onClose}
      maxWidth='md'
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
        <Box sx={{ flex: 1 }}>
          <Typography variant='h6' component='div' fontWeight={700}>
            {date ? formatGtfsDateLong(date) : ''}
          </Typography>
          {activeCounts && (
            <Typography variant='caption' color='text.secondary'>
              Active services: {activeCounts[0]} before → {activeCounts[1]}{' '}
              after
            </Typography>
          )}
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
        <IconButton size='small' onClick={onClose} aria-label='Close'>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {hidden > 0 && (
          <Alert severity='info' sx={{ mb: 2 }}>
            {hidden} change{hidden === 1 ? '' : 's'} on this day hidden by the
            current filters.
          </Alert>
        )}
        {entries != null && total === 0 && (
          <Typography color='text.secondary'>
            No changes on this day for the current filters.
          </Typography>
        )}
        {loading && entries == null ? <LinearProgress /> : null}
        {rows.length > PLAIN_LIST_MAX ? (
          <Box
            sx={{ height: '60vh', display: 'flex', flexDirection: 'column' }}
          >
            <SegmentedList<DialogRow>
              queryKey={entriesKey}
              total={rows.length}
              fetchRows={(offset, limit) =>
                Promise.resolve(rows.slice(offset, offset + limit))
              }
              rowKey={rowKey}
              renderRow={renderRow}
              emptyText=''
            />
          </Box>
        ) : (
          <List dense disablePadding>
            {rows.map((r) => (
              <React.Fragment key={rowKey(r)}>{renderRow(r)}</React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
