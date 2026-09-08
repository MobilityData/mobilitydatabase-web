'use client';

import * as React from 'react';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Container,
  Stack,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '../../../../../../i18n/navigation';

export interface SealReliabilityErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary content for the Seal of Reliability analysis page.
 *
 * Unlike the main feed detail page - which tolerates a failed reliability
 * fetch by simply hiding the seal - this page exists solely to show that
 * data, so a failed fetch is presented as a full page error instead.
 */
export default function SealReliabilityError({
  error,
  reset,
}: SealReliabilityErrorProps): React.ReactElement {
  const t = useTranslations('feeds');
  // usePathname() strips the locale prefix, so this stays correct in `fr`.
  const pathname = usePathname();
  const feedHref = pathname.replace(/\/seal-of-reliability\/?$/, '');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Container component='main' maxWidth='md' sx={{ my: 4 }}>
      <Stack spacing={2} data-testid='seal-reliability-error'>
        <Alert severity='error' variant='filled'>
          <AlertTitle>{t('sealReliabilityErrorTitle')}</AlertTitle>
          {t('sealReliabilityErrorDescription')}
        </Alert>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant='contained' onClick={reset}>
            {t('retry')}
          </Button>
          <Button variant='outlined' component={Link} href={feedHref}>
            {t('sealReliabilityErrorBackToFeed')}
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
