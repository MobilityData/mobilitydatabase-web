import { type ReactElement } from 'react';
import {Container, Typography } from '@mui/material';
import { notFound } from 'next/navigation';
import {
  type AllFeedType,
  isGtfsFeedType,
} from '../../../services/feeds/utils';


interface Props {

}

export default async function FeedReliabilityView({
}: Props): Promise<ReactElement> {

  return (
    <Container component='main' maxWidth='md' sx={{ py: 4 }}>
      <Typography>Reliability Page</Typography>
    </Container>
  );
}
