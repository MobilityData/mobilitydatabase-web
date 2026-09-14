import * as React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import {
  type AvailabilityCalendar,
  type AvailabilityDayStatus,
} from '../lib/availability-history';
import { formatDateShort, formatMonthShort } from '../../../utils/date';
import { theme } from '../../../Theme';

/**
 * Columns stretch to fill the card, so a cell's size follows the width it is
 * given. This is the floor: below it the grid scrolls sideways rather than
 * shrinking the days into invisibility.
 */
const MIN_CELL_SIZE = 10;
const CELL_GAP = 4;

const STATUS_COLORS: Record<AvailabilityDayStatus, string> = {
  success: theme.vars.palette.success.light,
  failure: theme.vars.palette.error.main,
  unchecked: theme.vars.palette.action.disabledBackground,
};

const STATUS_TOOLTIP_KEYS: Record<AvailabilityDayStatus, string> = {
  success: 'sealAvailabilityDaySuccess',
  failure: 'sealAvailabilityDayFailure',
  unchecked: 'sealAvailabilityDayUnchecked',
};

/** A percentage radius so the corners stay proportional as cells scale up. */
const CELL_SX = { aspectRatio: '1 / 1', borderRadius: '18%' } as const;

export interface AvailabilityHeatmapProps {
  calendar: AvailabilityCalendar;
}

/**
 * The daily fetch record as a contribution-style grid: one column per week,
 * one cell per day, Sunday at the top. Rendered on the server - the only
 * interactive leaves are the per-day tooltips, which are Client Components in
 * their own right, so colors come from the theme module rather than useTheme.
 */
export default async function AvailabilityHeatmap({
  calendar,
}: AvailabilityHeatmapProps): Promise<React.ReactElement | null> {
  const t = await getTranslations('feeds');

  if (calendar.weeks.length === 0) {
    return null;
  }

  const columns = `repeat(${calendar.weeks.length}, minmax(${MIN_CELL_SIZE}px, 1fr))`;
  const minWidth =
    calendar.weeks.length * MIN_CELL_SIZE +
    (calendar.weeks.length - 1) * CELL_GAP;

  return (
    <Box
      data-testid='availability-heatmap'
      role='img'
      aria-label={t('sealAvailabilityHeatmapLabel', {
        success: calendar.successCount,
        failed: calendar.failureCount,
      })}
      sx={{ mt: 2, overflowX: 'auto', pb: 1 }}
    >
      <Box sx={{ minWidth: `${minWidth}px` }}>
        <Box
          aria-hidden
          sx={{
            display: 'grid',
            gridTemplateColumns: columns,
            columnGap: `${CELL_GAP}px`,
            mb: 0.5,
          }}
        >
          {calendar.monthLabels.map((label) => (
            <Typography
              key={label.date}
              variant='caption'
              color='text.secondary'
              sx={{
                // Anchored to a single column and left to overflow to the
                // right. Spanning several columns instead would overlap the
                // next label - months can sit as few as three columns apart -
                // and grid would push one of them onto a second row.
                gridColumn: label.columnIndex + 1,
                whiteSpace: 'nowrap',
              }}
            >
              {formatMonthShort(label.date)}
            </Typography>
          ))}
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: columns,
            gridTemplateRows: 'repeat(7, auto)',
            gridAutoFlow: 'column',
            gap: `${CELL_GAP}px`,
          }}
        >
          {calendar.weeks.flatMap((week, weekIndex) =>
            week.map((day, dayIndex) =>
              day == undefined ? (
                // Keeps the row height when a padded week starts or ends the
                // window, so the grid stays square.
                <Box key={`${weekIndex}-${dayIndex}`} sx={CELL_SX} />
              ) : (
                <Tooltip
                  key={day.date}
                  placement='top'
                  title={t(STATUS_TOOLTIP_KEYS[day.status], {
                    date: formatDateShort(day.date),
                  })}
                >
                  <Box
                    sx={{
                      ...CELL_SX,
                      backgroundColor: STATUS_COLORS[day.status],
                    }}
                  />
                </Tooltip>
              ),
            ),
          )}
        </Box>
      </Box>
    </Box>
  );
}
