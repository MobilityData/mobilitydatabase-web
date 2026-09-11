import * as React from 'react';
import { Chip } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { getTranslations } from 'next-intl/server';
import {
  type CriterionDisplayStatus,
  getCriterionStatusColor,
} from '../../../constants/sealCriteria';

export interface AvailabilityUptimeChipProps {
  /** Share of checked days that succeeded, 0-100. */
  uptimePercent: number;
  /** Colors the chip the same as the criterion it summarises. */
  displayStatus: CriterionDisplayStatus;
}

/**
 * Headline number for the Available criterion: the share of days in the
 * window whose fetch succeeded. Days the job never checked are excluded, so
 * a gap in the record doesn't read as downtime.
 */
export default async function AvailabilityUptimeChip({
  uptimePercent,
  displayStatus,
}: AvailabilityUptimeChipProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const color = getCriterionStatusColor(displayStatus);

  return (
    <Chip
      data-testid='availability-uptime-chip'
      size='small'
      variant='outlined'
      icon={<CheckCircleOutlineIcon aria-hidden />}
      label={t('sealAvailabilityUptime', {
        percent: uptimePercent.toFixed(1),
      })}
      sx={{
        color,
        borderColor: color,
        flexShrink: 0,
        '& .MuiChip-icon': { color },
      }}
    />
  );
}
