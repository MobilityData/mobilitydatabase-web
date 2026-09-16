'use client';
import { Box, Chip, Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';
import SealOfReliability, { SEAL_INK } from './SealOfReliability';
import { useUserFeatureFlags } from '../hooks/useUserFeatureFlags';

export interface SealOfReliabilityChipProps {
  hasSeal: boolean | undefined;
  feedId: string;
  feedDataType: string;
  /** Render as a plain chip - used when already on the seal analysis page. */
  disableLink?: boolean;
}

export default function SealOfReliabilityChip({
  hasSeal,
  feedId,
  feedDataType,
  disableLink = false,
}: SealOfReliabilityChipProps): React.ReactElement | null {
  const t = useTranslations('feeds');
  const {
    flags: { isSealEnabled },
  } = useUserFeatureFlags();

  if (!isSealEnabled || hasSeal == undefined) {
    return null;
  }

  const href = `/feeds/${feedDataType}/${feedId}/seal-of-reliability`;
  const linkProps = disableLink
    ? {}
    : { component: Link, href, clickable: true };

  if (hasSeal) {
    return (
      <Tooltip title={t('sealOfReliabilityTooltipShort')} placement='top'>
        <Chip
          data-testid='seal-of-reliability-chip'
          {...linkProps}
          icon={
            <Box>
              <SealOfReliability size='small' tone='reverse' disableTooltip />
            </Box>
          }
          label={t('sealOfReliabilityAlt')}
          sx={(theme) => ({
            background: `linear-gradient(25deg, ${SEAL_INK}, ${theme.vars.palette.secondary.dark})`,
            color: '#FFFFFF',
            fontWeight: 600,
            letterSpacing: '0.01em',
            '& .MuiChip-label': { paddingLeft: '8px' },
            '& .MuiChip-icon': { marginLeft: '6px', marginRight: '-2px' },
            ...theme.applyStyles('dark', {
              background: `linear-gradient(25deg, #FFFFFF, ${theme.vars.palette.secondary.light})`,
              color: SEAL_INK,
            }),
          })}
        />
      </Tooltip>
    );
  }

  return null;
}
