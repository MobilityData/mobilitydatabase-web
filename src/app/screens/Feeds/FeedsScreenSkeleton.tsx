'use client';
import * as React from 'react';
import { Box, Container, Grid, Skeleton } from '@mui/material';
import { ColoredContainer } from '../../styles/PageLayout.style';

/**
 * Loading skeleton that mirrors the FeedsScreen layout.
 * Used as the Suspense fallback in the /feeds page.
 */
export default function FeedsScreenSkeleton(): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }} mx={{ xs: 0, md: 'auto' }}>
      {/* Page title */}
      <Container disableGutters maxWidth='xl' sx={{ boxSizing: 'content-box' }}>
        <Skeleton variant='text' sx={{ fontSize: '2.125rem', width: '120px' }} />
      </Container>

      {/* Search bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 2 }}>
        <Container maxWidth='xl' sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Skeleton variant='rounded' height={55} sx={{ flexGrow: 1 }} />
          <Skeleton variant='rounded' width={85} height={55} />
        </Container>
      </Box>

      <ColoredContainer maxWidth='xl' sx={{ pt: 2 }}>
        <Grid
          container
          spacing={1}
          sx={{ fontSize: '18px', mt: 0, flexWrap: { xs: 'wrap', md: 'nowrap' } }}
        >
          {/* Filter sidebar */}
          <Grid size={{ xs: 12, md: 2 }} sx={{ minWidth: '275px', pr: 2 }}>
            <Skeleton variant='text' sx={{ fontSize: '1.25rem', width: '80%', mb: 1 }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant='text' sx={{ fontSize: '1rem', width: '90%', mb: 0.5 }} />
            ))}
            <Skeleton variant='text' sx={{ fontSize: '1.25rem', width: '70%', mt: 2, mb: 1 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant='text' sx={{ fontSize: '1rem', width: '85%', mb: 0.5 }} />
            ))}
          </Grid>

          {/* Results area */}
          <Grid size={{ xs: 12, md: 10 }}>
            {/* Active-filter chips row */}
            <Skeleton variant='text' sx={{ fontSize: '1rem', width: '200px', mb: 1 }} />
            {/* Result count + view toggle */}
            <Skeleton
              animation='wave'
              variant='text'
              sx={{ fontSize: '2rem', width: '100%', mb: 1 }}
            />
            {/* Table body */}
            <Skeleton
              animation='wave'
              variant='rectangular'
              width='100%'
              height={1118}
            />
            {/* Pagination */}
            <Skeleton
              animation='wave'
              variant='text'
              sx={{ fontSize: '2rem', width: '320px', mt: 1 }}
            />
          </Grid>
        </Grid>
      </ColoredContainer>
    </Box>
  );
}
