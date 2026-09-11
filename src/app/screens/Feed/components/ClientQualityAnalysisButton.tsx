'use client';

import { Button } from '@mui/material';
import { sendGAEvent } from '@next/third-parties/google';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';
import { useRemoteConfig } from '../../../context/RemoteConfigProvider';

export default function ClientQualityAnalysisButton({
  feedId,
  feedDataType,
}: {
  feedId: string;
  feedDataType: string;
}): React.ReactElement | null {
  const t = useTranslations('feeds');
  const { config } = useRemoteConfig();

  const handleViewFeedQualityAnalysisClick = (): void => {
    sendGAEvent('event', 'view_feed_quality_analysis', {
      event_category: 'engagement',
      event_label: 'View Feed Quality Analysis',
    });
  };

  if (!config.enableSealOfReliability) {
    return null;
  }

  return (
    <Button
      variant='outlined'
      disableElevation
      component={Link}
      href={`/feeds/${feedDataType}/${feedId}/seal-of-reliability`}
      onClick={handleViewFeedQualityAnalysisClick}
    >
      {t('viewFeedQualityAnalysis')}
    </Button>
  );
}
