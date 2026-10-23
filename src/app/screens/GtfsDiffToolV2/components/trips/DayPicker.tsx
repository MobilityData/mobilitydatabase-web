'use client';

import {
  Alert,
  Box,
  Chip,
  FormControlLabel,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useState } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import type { DayTypeOption } from '../../lib/trips-types';
import {
  type AnchorKey,
  type PeriodDayType,
  type PeriodSide,
  anchorDates,
  anchorKey,
  isCrossPeriod,
} from '../../lib/trips-anchor';
import { formatGtfsDate } from '../../lib/calendar-utils';
import { fromIsoDate, toIsoDate } from '../../lib/trips-utils';

type Range = { min: GtfsDate | null; max: GtfsDate | null };

interface DayPickerProps {
  /** Day types on dates both feeds run (empty when they share none). */
  dayTypes: DayTypeOption[];
  /** Typical day of each feed's own period, paired by day type. */
  periodTypes: PeriodDayType[];
  /** The comparison: a date, or "<base>~<new>" (lib/trips-anchor.ts). */
  value: AnchorKey;
  bounds: Range;
  coverage: { base: Range; new: Range };
  onChange: (key: AnchorKey) => void;
}

function DateField({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: GtfsDate;
  range: Range;
  onChange: (d: GtfsDate) => void;
}): React.ReactElement {
  return (
    <TextField
      type='date'
      size='small'
      label={label}
      value={toIsoDate(value)}
      onChange={(e) => {
        if (e.target.value) onChange(fromIsoDate(e.target.value));
      }}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: {
          min: range.min ? toIsoDate(range.min) : undefined,
          max: range.max ? toIsoDate(range.max) : undefined,
        },
      }}
      sx={{ width: 170 }}
    />
  );
}

function sideText(side: PeriodSide, label: string): string {
  return `${formatGtfsDate(side.date)} (same services on ${side.day_count} of ${side.group_count} ${label.toLowerCase()}s, ${formatGtfsDate(side.first)} – ${formatGtfsDate(side.last)})`;
}

function rangeText(r: Range): string {
  return `${formatGtfsDate(r.min)} – ${formatGtfsDate(r.max)}`;
}

/**
 * Everything in the Trips view hangs off a comparison. When the feeds share
 * service dates it is one day: a typical Weekday / Saturday / Sunday or any
 * date. When they don't (or on request), it pairs a base date with a new
 * date, e.g. a typical summer weekday against a typical fall weekday.
 */
export default function DayPicker({
  dayTypes,
  periodTypes,
  value,
  bounds,
  coverage,
  onChange,
}: DayPickerProps): React.ReactElement {
  const shared = dayTypes.length > 0;
  const [twoDates, setTwoDates] = useState(!shared || isCrossPeriod(value));
  const dates = anchorDates(value);
  const activeType = dayTypes.find((d) => d.date === value);
  const activePeriod = periodTypes.find((p) => p.key === value);

  const chips = shared
    ? dayTypes.map((d) => {
        const active = d.date === value;
        return (
          <Tooltip
            key={d.id}
            title={`Diffs ${formatGtfsDate(d.date)}. The same services run on ${d.day_count} of ${d.group_count} ${d.label.toLowerCase()}s compared (${formatGtfsDate(d.first)} – ${formatGtfsDate(d.last)}).`}
          >
            <Chip
              label={
                d.primary ? d.label : `${d.label} variant · ${d.day_count} days`
              }
              size={d.primary ? 'medium' : 'small'}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={() => {
                setTwoDates(false);
                onChange(d.date);
              }}
              sx={{ fontWeight: d.primary ? 700 : 400 }}
            />
          </Tooltip>
        );
      })
    : periodTypes.map((p) => {
        const active = p.key === value;
        return (
          <Tooltip
            key={p.id}
            title={
              <>
                Base: {sideText(p.base, p.label)}
                <br />
                New: {sideText(p.new, p.label)}
              </>
            }
          >
            <Chip
              label={p.label}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={() => onChange(p.key)}
              sx={{ fontWeight: 700 }}
            />
          </Tooltip>
        );
      });

  return (
    <Box>
      {!shared && (
        <Alert severity='info' sx={{ mb: 1.5 }}>
          These feeds share no service dates (base {rangeText(coverage.base)},
          new {rangeText(coverage.new)}), so each comparison pairs a typical day
          of the base period with the same kind of day in the new period.
        </Alert>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant='body2' fontWeight={700} sx={{ mr: 0.5 }}>
          {shared ? 'On which day?' : 'Which kind of day?'}
        </Typography>
        {chips}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 0.5 }}>
          {twoDates ? (
            <>
              <DateField
                label='Base date'
                value={dates.base}
                range={coverage.base}
                onChange={(d) => onChange(anchorKey(d, dates.new))}
              />
              <Typography color='text.secondary'>vs</Typography>
              <DateField
                label='New date'
                value={dates.new}
                range={coverage.new}
                onChange={(d) => onChange(anchorKey(dates.base, d))}
              />
            </>
          ) : (
            <DateField
              label='Specific date'
              value={dates.new}
              range={bounds}
              onChange={onChange}
            />
          )}
          {shared && (
            <FormControlLabel
              sx={{ ml: 0.5 }}
              control={
                <Switch
                  size='small'
                  checked={twoDates}
                  onChange={(e) => {
                    setTwoDates(e.target.checked);
                    // Back to one day: keep the new side's date.
                    if (!e.target.checked) onChange(dates.new);
                  }}
                />
              }
              label={<Typography variant='caption'>Different dates</Typography>}
            />
          )}
        </Box>
      </Box>
      <Typography
        variant='caption'
        color='text.secondary'
        component='div'
        sx={{ mt: 0.75 }}
      >
        {isCrossPeriod(value)
          ? `${activePeriod ? `Typical ${activePeriod.label.toLowerCase()}: ` : ''}base ${formatGtfsDate(dates.base)} vs new ${formatGtfsDate(dates.new)}`
          : activeType
            ? `Typical ${activeType.label.toLowerCase()}: ${formatGtfsDate(value)}`
            : formatGtfsDate(value)}
      </Typography>
    </Box>
  );
}
