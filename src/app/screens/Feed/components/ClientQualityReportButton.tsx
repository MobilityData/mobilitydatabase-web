'use client';

import { Button } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { sendGAEvent } from '@next/third-parties/google';
import { useTranslations } from 'next-intl';

export default function ClientQualityReportButton({
  url,
}: {
  url: string;
}): React.ReactElement {
  const t = useTranslations('feeds');

  const handleOpenFullQualityReportClick = (): void => {
    sendGAEvent('event', 'open_full_quality_report', {
      event_category: 'engagement',
      event_label: 'Open Full Quality Report',
    });
  };

  return (
    <Button
      variant='outlined'
      disableElevation
      href={url}
      target='_blank'
      rel='noreferrer nofollow'
      endIcon={<OpenInNewIcon />}
      onClick={handleOpenFullQualityReportClick}
    >
      {t('openFullQualityReport')}
    </Button>
  );
}
