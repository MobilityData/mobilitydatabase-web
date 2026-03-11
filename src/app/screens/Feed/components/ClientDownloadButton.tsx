'use client';

import { Button } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { sendGAEvent } from '@next/third-parties/google';
import { useTranslations } from 'next-intl';

export default function ClientDownloadButton({
  url,
}: {
  url: string;
}): React.ReactElement {
  const t = useTranslations('feeds');

  const handleDownloadLatestClick = (): void => {
    sendGAEvent('event', 'download_latest_dataset', {
      event_category: 'engagement',
      event_label: 'Download Latest Dataset',
    });
  };

  return (
    <Button
      disableElevation
      variant='contained'
      href={url}
      target='_blank'
      rel='noreferrer nofollow'
      id='download-latest-button'
      endIcon={<DownloadIcon />}
      onClick={handleDownloadLatestClick}
    >
      {t('downloadLatest')}
    </Button>
  );
}
