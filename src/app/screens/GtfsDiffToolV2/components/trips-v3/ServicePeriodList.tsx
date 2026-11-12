'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import React, { useState } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import { type ServicePeriod, scheduleNote } from '../../lib/trips-periods';
import { ChangeTriplet, PeriodSwatch } from './shared';

/** Special periods shown before "Show all". */
const OTHER_PREVIEW = 5;

interface ServicePeriodListProps {
  periods: ServicePeriod[];
  /** Period whose days the calendar singles out; null for none. */
  onHover: (id: string | null) => void;
  /** Opens a day of the period: they all compare the same. */
  onOpen: (date: GtfsDate) => void;
}

/**
 * The trip calendar as service periods, one summary line each: typical
 * schedules, special periods (summer, school breaks), then exceptions (a
 * holiday running the Sunday schedule). A period opens its first day.
 */
export default function ServicePeriodList({
  periods,
  onHover,
  onOpen,
}: ServicePeriodListProps): React.ReactElement {
  const [showAll, setShowAll] = useState(false);
  const typical = periods.filter((p) => p.typical);
  const other = periods.filter((p) => !p.typical && !p.exception);
  const exceptions = periods.filter((p) => p.exception);
  const repeats = periods.some((p) => p.dates.length > 1);
  const rowProps = { onHover, onOpen };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {!repeats ? (
        <Typography variant='body2' color='text.secondary'>
          No two days run the same services in this feed, so each day is a
          period of its own.
        </Typography>
      ) : null}
      {typical.length > 0 ? (
        <PeriodGroup title='Typical schedules'>
          {typical.map((p) => (
            <PeriodRow key={p.id} period={p} {...rowProps} />
          ))}
        </PeriodGroup>
      ) : null}
      {other.length > 0 ? (
        <PeriodGroup
          title={repeats ? 'Special periods' : 'Days'}
          caption={
            repeats
              ? 'Summer timetables, school breaks and other days running a schedule of their own.'
              : undefined
          }
          more={
            other.length > OTHER_PREVIEW ? (
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
                  : `Show all ${other.length} ${repeats ? 'periods' : 'days'}`}
              </ButtonBase>
            ) : null
          }
        >
          {(showAll ? other : other.slice(0, OTHER_PREVIEW)).map((p) => (
            <PeriodRow key={p.id} period={p} {...rowProps} />
          ))}
        </PeriodGroup>
      ) : null}
      {exceptions.length > 0 ? (
        <PeriodGroup
          title='Exceptions'
          caption='Days running another day type’s schedule, such as a public holiday on the Sunday schedule.'
        >
          {exceptions.map((p) => (
            <PeriodRow key={p.id} period={p} {...rowProps} />
          ))}
        </PeriodGroup>
      ) : null}
    </Box>
  );
}

function PeriodGroup({
  title,
  caption,
  more,
  children,
}: {
  title: string;
  caption?: string;
  more?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box component='section' aria-label={title}>
      <Typography variant='subtitle2' fontWeight={700}>
        {title}
      </Typography>
      {caption ? (
        <Typography
          variant='caption'
          color='text.secondary'
          component='p'
          sx={{ mb: 0.75 }}
        >
          {caption}
        </Typography>
      ) : null}
      <Box
        component='ul'
        sx={{
          listStyle: 'none',
          p: 0,
          m: 0,
          mt: caption ? 0 : 0.75,
          bgcolor: 'action.hover',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
      {more}
    </Box>
  );
}

function PeriodRow({
  period: p,
  onHover,
  onOpen,
}: {
  period: ServicePeriod;
  onHover: (id: string | null) => void;
  onOpen: (date: GtfsDate) => void;
}): React.ReactElement {
  const days = p.dates.length;
  const note = scheduleNote(p);
  const c = p.counts;
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
        onClick={() => onOpen(p.dates[0])}
        onMouseEnter={() => onHover(p.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(p.id)}
        onBlur={() => onHover(null)}
        sx={{
          width: '100%',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-start',
          alignItems: 'center',
          textAlign: 'left',
          columnGap: 1.25,
          rowGap: 0.5,
          px: 1.5,
          py: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <PeriodSwatch color={p.color} size={12} />
        <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
          <Typography variant='body2'>
            <Box component='span' sx={{ fontWeight: 700 }}>
              {p.title}
            </Box>
            , {p.when}, {days} day{days === 1 ? '' : 's'}
          </Typography>
          {note ? (
            <Typography
              variant='caption'
              color='text.secondary'
              component='div'
            >
              {note}
            </Typography>
          ) : null}
        </Box>
        <Box
          sx={{
            flex: '0 1 auto',
            ml: { xs: 3.25, sm: 'auto' },
            textAlign: { xs: 'left', sm: 'right' },
          }}
        >
          <Typography variant='body2' fontWeight={700}>
            {p.changed === 0
              ? 'No trip changes'
              : `${p.changed.toLocaleString()} trip${p.changed === 1 ? '' : 's'} change (${Math.round(p.share * 100)}%)`}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'baseline',
              justifyContent: { xs: 'flex-start', sm: 'flex-end' },
              flexWrap: 'wrap',
            }}
          >
            {p.changed > 0 ? <ChangeTriplet counts={c} size='0.72rem' /> : null}
            <Typography variant='caption' color='text.secondary'>
              {c.base === c.new
                ? `${c.new.toLocaleString()} trips`
                : `${c.base.toLocaleString()} → ${c.new.toLocaleString()} trips`}
            </Typography>
          </Box>
        </Box>
      </ButtonBase>
    </Box>
  );
}
