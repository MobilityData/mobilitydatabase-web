import * as React from 'react';
import { Chip } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import {
  CRITERION_STATUS_ICONS,
  CRITERION_STATUS_LABEL_KEYS,
  type CriterionDisplayStatus,
  getCriterionStatusColor,
} from '../../../constants/sealCriteria';

export interface CriterionStatusChipProps {
  displayStatus: CriterionDisplayStatus;
}

/**
 * Pass / At Risk / Fail / ... chip, colored and iconed by the shared criterion
 * logic.
 */
export default async function CriterionStatusChip({
  displayStatus,
}: CriterionStatusChipProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const color = getCriterionStatusColor(displayStatus);
  const StatusIcon = CRITERION_STATUS_ICONS[displayStatus];

  return (
    <Chip
      data-testid={`criterion-status-chip-${displayStatus}`}
      size='small'
      variant='outlined'
      icon={<StatusIcon aria-hidden />}
      label={t(CRITERION_STATUS_LABEL_KEYS[displayStatus])}
      sx={{
        color,
        borderColor: color,
        flexShrink: 0,
        '& .MuiChip-icon': { color },
      }}
    />
  );
}
