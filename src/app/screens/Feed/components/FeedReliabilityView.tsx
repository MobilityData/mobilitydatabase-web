import { type ReactElement } from 'react';
import { Container, Typography } from '@mui/material';

export default async function FeedReliabilityView(): Promise<ReactElement> {
  return (
    <Container component='main' maxWidth='md' sx={{ py: 4 }}>
      <Typography>Reliability Page</Typography>
    </Container>
  );
}
