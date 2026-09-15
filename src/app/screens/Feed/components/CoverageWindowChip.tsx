import * as React from 'react';
import { Chip, Tooltip } from '@mui/material';
import DateRangeIcon from '@mui/icons-material/DateRange';
import { getTranslations } from 'next-intl/server';
import {
  type CriterionDisplayStatus,
  getCriterionStatusColor,
} from '../../../constants/sealCriteria';
import {
  type CoverageWindowLength,
  getCoverageWindowTooltip,
} from '../lib/continuous-coverage';

export interface CoverageWindowChipProps {
  /** Length of the latest dataset's coverage window, already unit-picked. */
  windowLength: CoverageWindowLength;
  displayStatus: CriterionDisplayStatus;
  /**
   * The API's verdict on the two-year rule, which the tooltip states. Null
   * when there was no window to measure.
   */
  withinMax?: boolean | null;
}

export default async function CoverageWindowChip({
  windowLength,
  displayStatus,
  withinMax,
}: CoverageWindowChipProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const color = getCriterionStatusColor(displayStatus);
  const tooltip = getCoverageWindowTooltip(withinMax);

  return (
    // The figure is a length with no rule attached, so the rule it is
    // measured against is a hover away rather than absent.
    <Tooltip title={t(tooltip.key, tooltip.values)} arrow enterTouchDelay={0}>
      <Chip
        data-testid='coverage-window-chip'
        size='small'
        variant='outlined'
        icon={<DateRangeIcon aria-hidden />}
        label={t(windowLength.key, windowLength.values)}
        sx={{
          color,
          borderColor: color,
          flexShrink: 0,
          cursor: 'help',
          '& .MuiChip-icon': { color },
        }}
      />
    </Tooltip>
  );
}
