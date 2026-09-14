'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';

/**
 * Small text link to the Seal of Reliability description page, opened in a
 * new tab. Split out as its own client component because MUI's `component`
 * prop takes a component reference - passing `Link` there from a Server
 * Component (FeedReliabilityView) isn't serializable across the RSC
 * boundary.
 */
export default function AboutSealButton(): React.ReactElement {
  const t = useTranslations('feeds');

  return (
    <Button
      variant='text'
      size='small'
      color='secondary'
      component={Link}
      href='/seal-of-reliability'
      target='_blank'
      rel='noreferrer'
      endIcon={<OpenInNewIcon fontSize='small' />}
    >
      {t('sealAboutButtonLabel')}
    </Button>
  );
}
