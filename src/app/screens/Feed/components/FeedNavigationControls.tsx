'use client';

import { Button, Grid, Typography } from '@mui/material';
import { ChevronLeft } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '../../../../i18n/navigation';

interface Props {
  feedDataType: string;
  feedId: string;
  /**
   * Breadcrumb leaf for feed sub-pages. When set, the feed id becomes a link
   * back to the feed detail page and this label is appended after it.
   */
  currentPageLabel?: string;
  /** Where the back button goes when there is no history to pop. */
  backFallbackHref?: string;
}

export default function FeedNavigationControls({
  feedDataType,
  feedId,
  currentPageLabel,
  backFallbackHref = '/feeds',
}: Props): React.ReactElement {
  const t = useTranslations('common');
  const router = useRouter();

  const handleBack = (): void => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backFallbackHref);
  };

  const feedIdLabel =
    feedDataType === 'gbfs' ? feedId?.replace('gbfs-', '') : feedId;

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
          /{' '}
          {currentPageLabel != undefined ? (
            <>
              <Button
                variant='text'
                component={Link}
                href={`/feeds/${feedDataType}/${feedId}`}
                className='inline'
              >
                {feedIdLabel}
              </Button>
              /{' '}
              <span data-testid='breadcrumb-current-page'>
                {currentPageLabel}
              </span>
            </>
          ) : (
            feedIdLabel
          )}
        </Typography>
      </Grid>
    </Grid>
  );
}
