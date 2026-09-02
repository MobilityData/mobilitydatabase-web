'use client';
import { Chip, Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { Link } from '../../i18n/navigation';
import SealOfReliability, {
} from './SealOfReliability';

export interface SealOfReliabilityChipProps {
  hasSeal: boolean | undefined;
  feedId: string;
  feedDataType: string;
}

// TODO: revisit once logo is finalized
export default function SealOfReliabilityChip({
  hasSeal,
  feedId,
  feedDataType,
}: SealOfReliabilityChipProps): React.ReactElement | null {
  const t = useTranslations('feeds');

  if (hasSeal == undefined) {
    return null;
  }

  const href = `/feeds/${feedDataType}/${feedId}/seal-of-reliability`;

  if (hasSeal) {
    return (
      <Tooltip title={t('sealOfReliabilityTooltipShort')} placement='top'>
        <Chip
          data-testid='seal-of-reliability-chip'
          component={Link}
          href={href}
          clickable
          icon={
            <SealOfReliability
              size='small'        
            />
          }
          label={t('sealOfReliabilityAlt')}
          sx={{
            background: 'white',
            color: 'black',
            '& .MuiChip-icon': {
              borderRadius: '50%',
              boxShadow: '0 0 0 1.5px rgba(255,255,255,0.7)',
              marginLeft: '5px',
              marginRight: '-6px'
            },
          }}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title={t('noSealTooltip')} placement='top'>
      <Chip
        data-testid='seal-of-reliability-chip'
        component={Link}
        href={href}
        clickable
        icon={<WorkspacePremiumIcon />}
        label={t('noSealLabel')}
        variant='outlined'
        sx={{ opacity: 0.7 }}
      />
    </Tooltip>
  );
}
