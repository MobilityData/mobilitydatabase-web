'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Container,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import { useSearchParams, useRouter } from 'next/navigation';
import { unsubscribeById } from '../../../services/notification-service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function UnsubscribeClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();
  const subscriptionId = searchParams.get('id');

  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUnsubscribe = async (id: string) => {
    setStatus('loading');
    setErrorMessage(null);

    if (!id || !UUID_REGEX.test(id)) {
      setStatus('error');
      setErrorMessage(
        'Invalid subscription ID. Please check the link in your email.',
      );
      return;
    }

    try {
      await unsubscribeById(id);
      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      const message =
        err instanceof Error ? err.message : 'Failed to unsubscribe';
      setErrorMessage(
        message.includes('not found') || message.includes('404')
          ? 'This subscription was already unsubscribed or does not exist.'
          : message,
      );
    }
  };

  useEffect(() => {
    if (subscriptionId) {
      void handleUnsubscribe(subscriptionId);
    } else {
      setStatus('error');
      setErrorMessage(
        'Missing subscription ID. Please use the link provided in your email.',
      );
    }
  }, [subscriptionId]);

  return (
    <Container maxWidth='sm' sx={{ py: 8 }}>
      <Card sx={{ p: 2, textAlign: 'center', boxShadow: 3 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              bgcolor: 'primary.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1,
            }}
          >
            <NotificationsOffIcon color='primary' sx={{ fontSize: 36 }} />
          </Box>

          <Typography variant='h5' component='h1' fontWeight={700}>
            Notification Unsubscribe
          </Typography>

          {status === 'loading' && (
            <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <CircularProgress />
              <Typography variant='body2' color='text.secondary'>
                Processing your unsubscribe request...
              </Typography>
            </Box>
          )}

          {status === 'success' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, my: 2 }}>
              <CheckCircleOutlineIcon color='success' sx={{ fontSize: 48 }} />
              <Typography variant='h6' color='success.main' fontWeight={600}>
                Successfully Unsubscribed
              </Typography>
              <Typography variant='body2' color='text.secondary'>
                You have been unsubscribed from this notification feed. You will no longer receive emails for these updates.
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button variant='contained' onClick={() => router.push('/')}>
                  Return to Home
                </Button>
                <Button variant='outlined' onClick={() => router.push('/account/notifications')}>
                  Manage Preferences
                </Button>
              </Box>
            </Box>
          )}

          {status === 'error' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, my: 2, width: '100%' }}>
              <ErrorOutlineIcon color='error' sx={{ fontSize: 48 }} />
              <Alert severity='error' sx={{ width: '100%' }}>
                {errorMessage ?? 'An error occurred while unsubscribing.'}
              </Alert>
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                {subscriptionId && (
                  <Button
                    variant='contained'
                    onClick={() => void handleUnsubscribe(subscriptionId)}
                  >
                    Retry
                  </Button>
                )}
                <Button variant='outlined' onClick={() => router.push('/')}>
                  Go to Home
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
