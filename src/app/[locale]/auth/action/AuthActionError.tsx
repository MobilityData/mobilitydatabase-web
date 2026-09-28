'use client';

import * as React from 'react';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Alert, Button, Stack, Typography, useTheme } from '@mui/material';
import { useTranslations } from 'next-intl';
import { ContentBox } from '../../../components/ContentBox';
import { Link } from '../../../../i18n/navigation';
import { type AuthActionErrorReason } from './lib/auth-actions';

interface AuthActionErrorProps {
  reason: AuthActionErrorReason;
}

/**
 * Shown when Firebase sends us to the action URL with a mode we don't handle,
 * or without the one-time code the action needs.
 */
export default function AuthActionError({
  reason,
}: AuthActionErrorProps): React.ReactElement {
  const t = useTranslations('authAction');
  const theme = useTheme();

  return (
    <ContentBox
      title=''
      sx={{
        display: 'flex',
        justifyContent: 'center',
        backgroundColor: theme.vars.palette.background.paper,
        maxWidth: theme.breakpoints.values.sm,
        mx: 'auto',
        mt: 6,
      }}
    >
      <Stack spacing={3} alignItems='center' textAlign='center'>
        <ErrorOutlineIcon color='error' sx={{ fontSize: 56 }} />
        <Stack spacing={1.5}>
          <Typography variant='h4' component='h1' sx={{ fontWeight: 700 }}>
            {t('errorTitle')}
          </Typography>
          <Typography variant='body1' color='text.secondary'>
            {t('errorDescription')}
          </Typography>
        </Stack>
        <Alert severity='error' variant='outlined' sx={{ width: '100%' }}>
          {t(reason)}
        </Alert>
        <Button component={Link} href='/sign-in' variant='contained'>
          {t('backToSignIn')}
        </Button>
      </Stack>
    </ContentBox>
  );
}
