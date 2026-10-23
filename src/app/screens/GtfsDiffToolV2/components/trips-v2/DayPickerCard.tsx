'use client';

import {
  Box,
  ButtonBase,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import type { DayTypeOption } from '../../lib/trips-types';
import {
  type AnchorKey,
  type PeriodDayType,
  isCrossPeriod,
} from '../../lib/trips-anchor';
import { formatGtfsDate } from '../../lib/calendar-utils';
import {
  type DayCatalog,
  type SpecialDayGroup,
  type SpecialVerdict,
  shortDate,
  whenText,
} from '../../lib/trips-v2-days';
import MiniCalendar from './MiniCalendar';
import { CHANGED, V2Card, segmentedSx } from './shared';

export const DAY_PICKER_ID = 'trips-day-picker';

const VERDICT_TAG: Record<SpecialVerdict, string> = {
  different: 'Run differently',
  check: 'Open to compare',
  same: 'Same as a typical day',
};

const SPECIAL_PREVIEW = 6;

interface DayPickerCardProps {
  dayTypes: DayTypeOption[];
  periodTypes: PeriodDayType[];
  catalog: DayCatalog;
  coverage: {
    base: { min: GtfsDate | null; max: GtfsDate | null };
    new: { min: GtfsDate | null; max: GtfsDate | null };
  };
  /** A date, or "<base>~<new>" across periods. */
  value: AnchorKey;
  onChange: (key: AnchorKey) => void;
}

function range(r: { min: GtfsDate | null; max: GtfsDate | null }): string {
  return r.min && r.max
    ? `${formatGtfsDate(r.min)} – ${formatGtfsDate(r.max)}`
    : 'no service';
}

/**
 * Where the reader picks what to compare: a typical Weekday / Saturday /
 * Sunday, a special day (holidays and other days running their own
 * schedule), or any date on the calendar.
 */
export default function DayPickerCard({
  dayTypes,
  periodTypes,
  catalog,
  coverage,
  value,
  onChange,
}: DayPickerCardProps): React.ReactElement {
  const [showAll, setShowAll] = useState(false);
  const shared = catalog.shared;
  const typical = shared
    ? dayTypes
        .filter((d) => d.primary)
        .map((d) => ({
          key: d.date,
          label: d.label,
          hint:
            d.day_count > 1
              ? `${shortDate(d.date)} · ${d.day_count} of ${d.group_count} days`
              : `${shortDate(d.date)} · busiest`,
        }))
    : periodTypes.map((p) => ({
        key: p.key,
        label: p.label,
        hint: `${shortDate(p.base.date)} → ${shortDate(p.new.date)}`,
      }));
  const selectedGroup = isCrossPeriod(value)
    ? undefined
    : catalog.special.find((g) => g.key === catalog.groupOf[value]);
  const related = useMemo(
    () => new Set(selectedGroup?.dates ?? []),
    [selectedGroup],
  );
  const specialDays = catalog.special.reduce((n, g) => n + g.dates.length, 0);
  const shown = showAll
    ? catalog.special
    : catalog.special.slice(0, SPECIAL_PREVIEW);

  return (
    <V2Card
      id={DAY_PICKER_ID}
      title='Choose the day to compare'
      caption='Trips run on dates, not in general: the changes below are worked out for one service day at a time.'
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' },
          gap: 3,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 1 }}>
            Typical days
          </Typography>
          <ToggleButtonGroup
            exclusive
            size='small'
            value={typical.some((t) => t.key === value) ? value : null}
            onChange={(_, v: AnchorKey | null) => v && onChange(v)}
            aria-label='Typical day'
            sx={{ flexWrap: 'wrap', mb: 1 }}
          >
            {typical.map((t) => (
              <ToggleButton
                key={t.key}
                value={t.key}
                sx={{
                  ...segmentedSx,
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  lineHeight: 1.25,
                  minWidth: 130,
                }}
              >
                <Box component='span' sx={{ fontWeight: 700 }}>
                  {t.label}
                </Box>
                <Box
                  component='span'
                  sx={{ fontSize: '0.66rem', opacity: 0.8 }}
                >
                  {t.hint}
                </Box>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography
            variant='caption'
            color='text.secondary'
            component='p'
            sx={{ mb: 2.5 }}
          >
            {shared && !catalog.repeats
              ? 'No day pattern repeats in this feed, so each compares the day of that type with the most trips.'
              : shared
                ? 'Each compares the schedule most days of that type run, in both feeds.'
                : `The feeds share no service dates (before ${range(coverage.base)}, after ${range(coverage.new)}), so each compares a typical day of each feed.`}
          </Typography>

          <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 0.25 }}>
            Special days
          </Typography>
          {!shared ? (
            <Typography variant='body2' color='text.secondary'>
              Holidays and other special days need dates both feeds cover.
            </Typography>
          ) : !catalog.repeats ? (
            <Typography variant='body2' color='text.secondary'>
              Every date in this feed runs its own set of services, so special
              days can’t be told apart by their schedule. Pick any date on the
              calendar to compare it.
            </Typography>
          ) : catalog.special.length === 0 ? (
            <Typography variant='body2' color='text.secondary'>
              None: every date runs its day type’s typical schedule.
            </Typography>
          ) : (
            <>
              <Typography
                variant='caption'
                color='text.secondary'
                component='p'
                sx={{ mb: 1 }}
              >
                {specialDays} of {catalog.sharedDays} days run something other
                than their typical schedule (holidays, school breaks, one-offs),
                in {catalog.special.length} groups.{' '}
                {catalog.counts.different > 0
                  ? `${catalog.counts.different} of them are run differently by the two feeds.`
                  : 'Both feeds treat them alike.'}
              </Typography>
              <Box
                component='ul'
                sx={{
                  listStyle: 'none',
                  p: 0,
                  m: 0,
                  bgcolor: 'action.hover',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                {shown.map((g) => (
                  <SpecialRow
                    key={g.key}
                    group={g}
                    selected={g === selectedGroup}
                    onSelect={() => onChange(g.dates[0])}
                  />
                ))}
              </Box>
              {catalog.special.length > SPECIAL_PREVIEW ? (
                <ButtonBase
                  onClick={() => setShowAll((v) => !v)}
                  sx={{
                    mt: 0.75,
                    color: 'primary.main',
                    fontSize: '0.8rem',
                    textDecoration: 'underline',
                  }}
                >
                  {showAll
                    ? 'Show fewer'
                    : `Show all ${catalog.special.length} groups`}
                </ButtonBase>
              ) : null}
            </>
          )}
        </Box>

        <Box>
          <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 1 }}>
            Any date
          </Typography>
          {shared && catalog.period ? (
            <MiniCalendar
              kindOf={catalog.kindOf}
              value={isCrossPeriod(value) ? null : value}
              related={related}
              first={catalog.period.first}
              last={catalog.period.last}
              onSelect={onChange}
            />
          ) : (
            <Typography variant='body2' color='text.secondary'>
              No date runs in both feeds, so single dates can’t be compared.
            </Typography>
          )}
        </Box>
      </Box>
    </V2Card>
  );
}

function SpecialRow({
  group,
  selected,
  onSelect,
}: {
  group: SpecialDayGroup;
  selected: boolean;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <Box
      component='li'
      sx={{
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <ButtonBase
        onClick={onSelect}
        aria-pressed={selected}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          textAlign: 'left',
          gap: 1.25,
          px: 1.5,
          py: 1,
          bgcolor: selected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <VerdictMark verdict={group.verdict} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant='body2' fontWeight={700} noWrap>
            {whenText(group.dates)}
          </Typography>
          <Typography variant='caption' color='text.secondary' component='div'>
            {group.title}
          </Typography>
        </Box>
        <Typography
          variant='caption'
          sx={{
            whiteSpace: 'nowrap',
            fontWeight: group.verdict === 'different' ? 700 : 400,
            color: group.verdict === 'different' ? CHANGED : 'text.secondary',
          }}
        >
          {VERDICT_TAG[group.verdict]}
        </Typography>
      </ButtonBase>
    </Box>
  );
}

/** Same shapes as the calendar: filled, ring, small dot. */
function VerdictMark({
  verdict,
}: {
  verdict: SpecialVerdict;
}): React.ReactElement {
  return (
    <Box
      component='span'
      aria-hidden
      sx={{
        flexShrink: 0,
        width: verdict === 'same' ? 5 : 9,
        height: verdict === 'same' ? 5 : 9,
        mx: verdict === 'same' ? '2px' : 0,
        borderRadius: '50%',
        bgcolor:
          verdict === 'different'
            ? CHANGED
            : verdict === 'same'
              ? 'text.secondary'
              : 'transparent',
        border: verdict === 'check' ? `1.5px solid ${CHANGED}` : 0,
      }}
    />
  );
}
