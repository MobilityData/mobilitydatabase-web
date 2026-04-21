'use client';

import * as React from 'react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
  Alert,
  CircularProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { app } from '../../../firebase';
import { ContentBox } from '../../components/ContentBox';

type VerificationStatus = 'loading' | 'success' | 'error';

interface EmailVerificationContentProps {
  mode?: string;
  oobCode?: string;
}

export default function EmailVerificationContent({
  mode,
  oobCode,
}: EmailVerificationContentProps): React.ReactElement {
  const t = useTranslations('emailVerification');
  const theme = useTheme();
  const [status, setStatus] = React.useState<VerificationStatus>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const verifyEmail = async (): Promise<void> => {
      if (mode !== 'verifyEmail' || oobCode == null || oobCode.length === 0) {
        setStatus('error');
        setErrorMessage(t('invalidLink'));
        return;
      }

      try {
        await app.auth().applyActionCode(oobCode);

        setStatus('success');
        setErrorMessage(null);
      } catch {
        setStatus('error');
        setErrorMessage(t('verificationFailed'));
      }
    };

    void verifyEmail();
  }, [mode, oobCode]);

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
        {status === 'loading' ? (
          <CircularProgress aria-label={t('loadingTitle')} />
        ) : status === 'success' ? (
          <CheckCircleOutlineIcon color='success' sx={{ fontSize: 56 }} />
        ) : (
          <ErrorOutlineIcon color='error' sx={{ fontSize: 56 }} />
        )}

        <Stack spacing={1.5}>
          <Typography variant='h4' component='h1' sx={{ fontWeight: 700 }}>
            {status === 'loading'
              ? t('loadingTitle')
              : status === 'success'
                ? t('successTitle')
                : t('errorTitle')}
          </Typography>
          <Typography variant='body1' color='text.secondary'>
            {status === 'loading'
              ? t('loadingDescription')
              : status === 'success'
                ? t('successDescription')
                : t('errorDescription')}
          </Typography>
        </Stack>

        {errorMessage != null && (
          <Alert severity='error' variant='outlined' sx={{ width: '100%' }}>
            {errorMessage}
          </Alert>
        )}
      </Stack>
    </ContentBox>
  );
}
