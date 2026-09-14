'use client';
import Image from 'next/image';
import { Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';

export type SealOfReliabilitySize = 'xlarge' | 'large' | 'small';

export interface SealOfReliabilityProps {
  size?: SealOfReliabilitySize;
}

const SEAL_SIZE_PX: Record<SealOfReliabilitySize, number> = {
  xlarge: 160,
  large: 48,
  small: 24,
};

export default function SealOfReliability({
  size = 'large',
}: SealOfReliabilityProps): React.ReactElement {
  const t = useTranslations('feeds');
  const dimension = SEAL_SIZE_PX[size];

  const image = (
    <Image
      data-testid='seal-of-reliability-image'
      src='/assets/seal-reliability.png'
      alt={t('sealOfReliabilityAlt')}
      width={dimension}
      height={dimension}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );

  if (size === 'small') {
    return (
      <Tooltip title={t('sealOfReliabilityTooltipShort')} placement='top'>
        {image}
      </Tooltip>
    );
  }

  return image;
}
