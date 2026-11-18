import { type ReactElement } from 'react';
import { Box, Container, Skeleton } from '@mui/material';
import SectionContainer from '../../../components/SectionContainer';

const CARD_COUNT = 8;
const ROW_COUNT = 8;

/**
 * Shown while a location page streams in, e.g. after clicking a child
 * location; same layout as page.tsx so nothing jumps when it resolves.
 * ref: https://nextjs.org/docs/app/api-reference/file-conventions/loading
 */
export default function Loading(): ReactElement {
  return (
    <Container
      component='main'
      maxWidth='xl'
      aria-busy='true'
      sx={{ width: '100%', m: 'auto', px: 0 }}
    >
      <SectionContainer maxWidth='xl'>
        {/* Back button and breadcrumb */}
        <Skeleton
          animation='wave'
          variant='text'
          sx={{ fontSize: '1rem', width: 240 }}
        />
        {/* Title and intro */}
        <Skeleton
          animation='wave'
          variant='text'
          sx={{ fontSize: '3rem', width: { xs: '80%', sm: 360 }, mt: 1 }}
        />
        <Skeleton
          animation='wave'
          variant='text'
          sx={{ fontSize: '1.2rem', width: { xs: '100%', sm: 560 }, mb: 3 }}
        />
        {/* Feed count chips */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {[150, 140, 100].map((width) => (
            <Skeleton
              key={width}
              animation='wave'
              variant='rounded'
              width={width}
              height={32}
              sx={{ borderRadius: 4 }}
            />
          ))}
        </Box>

        {/* Child locations */}
        <Skeleton
          animation='wave'
          variant='text'
          sx={{ fontSize: '1.5rem', width: 200, mt: { xs: 4, md: 5 }, mb: 2 }}
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
            gap: 2,
          }}
        >
          {Array.from({ length: CARD_COUNT }, (_, index) => (
            <Skeleton
              key={index}
              animation='wave'
              variant='rounded'
              height={84}
            />
          ))}
        </Box>

        {/* Feeds table */}
        <Skeleton
          animation='wave'
          variant='text'
          sx={{ fontSize: '1.5rem', width: 260, mt: { xs: 4, md: 5 }, mb: 2 }}
        />
        {Array.from({ length: ROW_COUNT }, (_, index) => (
          <Skeleton
            key={index}
            animation='wave'
            variant='rectangular'
            height={48}
            sx={{ mb: 0.5 }}
          />
        ))}
      </SectionContainer>
    </Container>
  );
}
