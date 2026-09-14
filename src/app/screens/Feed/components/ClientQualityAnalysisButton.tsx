'use client';

import { Button } from '@mui/material';
import { sendGAEvent } from '@next/third-parties/google';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';

export default function ClientQualityAnalysisButton({
  feedId,
  feedDataType,
}: {
  feedId: string;
  feedDataType: string;
}): React.ReactElement {
  const t = useTranslations('feeds');

  const handleViewFeedQualityAnalysisClick = (): void => {
    sendGAEvent('event', 'view_feed_quality_analysis', {
      event_category: 'engagement',
      event_label: 'View Feed Quality Analysis',
    });
  };

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
