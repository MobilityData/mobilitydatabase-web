'use client';

import { Button, Grid, Typography } from '@mui/material';
import { ChevronLeft } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '../../../../i18n/navigation';

interface Props {
  feedDataType: string;
  feedId: string;
}

export default function FeedNavigationControls({
  feedDataType,
  feedId,
}: Props): React.ReactElement {
  const t = useTranslations('common');
  const router = useRouter();

  const handleBack = (): void => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/feeds');
  };

  return (
    <Grid container spacing={3} alignItems='center'>
      <Button
        size='large'
        startIcon={<ChevronLeft />}
        color={'inherit'}
        onClick={handleBack}
      >
        {t('back')}
      </Button>

      <Grid>
        <Typography
          sx={{
            a: {
              textDecoration: 'none',
            },
          }}
        >
          <Button
            variant='text'
            component={Link}
            href='/feeds'
            className='inline'
          >
            {t('feeds')}
          </Button>
          /
          <Button
            variant='text'
            component={Link}
            href={`/feeds?${feedDataType}=true`}
            className='inline'
          >
            {t(`${feedDataType}`)}
          </Button>
          / {feedDataType === 'gbfs' ? feedId?.replace('gbfs-', '') : feedId}
        </Typography>
      </Grid>
    </Grid>
  );
}
