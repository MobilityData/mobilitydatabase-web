import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { Box, CircularProgress, Container } from '@mui/material';
import UnsubscribeClient from './UnsubscribeClient';

export const metadata: Metadata = {
  title: 'Unsubscribe from Notifications | MobilityDatabase',
  description: 'Manage your notification subscription preferences.',
  robots: 'noindex, nofollow',
};

export default function UnsubscribePage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <Container maxWidth='sm' sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
          <Box sx={{ p: 4 }}>
            <CircularProgress />
          </Box>
        </Container>
      }
    >
      <UnsubscribeClient />
    </Suspense>
  );
}
