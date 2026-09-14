import { Box, Container, Skeleton } from '@mui/material';

const CRITERION_CHIP_COUNT = 6;

/**
 * Width-to-height of the availability heatmap: ~27 week columns of square
 * cells over 7 day rows. Held as a ratio rather than a height because the
 * real grid's cells scale with the width it is given.
 */
const HEATMAP_ASPECT_RATIO = '27 / 7';

/**
 * Loading skeleton for the Seal of Reliability analysis page, mirroring
 * `FeedReliabilityView`'s layout: header, page title row, seal banner with
 * its criteria chips, the two-up Official / Stable cards, then the full-width
 * Available and Compliant cards.
 * ref: https://nextjs.org/docs/app/api-reference/file-conventions/loading
 */
export default function SealReliabilitySkeleton(): React.ReactElement {
  return (
    <Container
      component='main'
      maxWidth='xl'
      sx={{
        my: 4,
        bgcolor: 'background.paper',
        py: 2,
        borderRadius: 2,
        px: 1,
        mx: 'auto',
      }}
    >
      <Box>
        {/* Breadcrumb skeleton */}
        <Skeleton
          animation='wave'
          variant='text'
          sx={{ fontSize: '1rem', width: '260px', mb: 2 }}
        />

        {/* Feed title skeleton */}
        <Skeleton
          animation='wave'
          variant='text'
          sx={{ fontSize: '3rem', width: { xs: '100%', sm: '500px' }, mb: 3 }}
        />

        {/* Page title + "About" button row skeleton */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 2,
            mb: 3,
          }}
        >
          <Skeleton
            animation='wave'
            variant='text'
            sx={{ fontSize: '2.125rem', width: { xs: '60%', sm: '360px' } }}
          />
          <Skeleton
            animation='wave'
            variant='text'
            sx={{ fontSize: '1rem', width: '220px' }}
          />
        </Box>

        {/* Seal banner skeleton */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: { xs: 'wrap', md: 'nowrap' },
            alignItems: 'center',
            gap: 4,
            p: 3,
            mb: 4,
          }}
        >
          <Skeleton
            animation='wave'
            variant='circular'
            sx={{
              width: { xs: 120, md: 160 },
              height: { xs: 120, md: 160 },
              flexShrink: 0,
            }}
          />
          <Box sx={{ width: '100%' }}>
            <Skeleton
              animation='wave'
              variant='text'
              sx={{ fontSize: '1.5rem', width: '240px', mb: 1 }}
            />
            <Skeleton
              animation='wave'
              variant='text'
              sx={{ fontSize: '1rem', width: { xs: '100%', sm: '480px' } }}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
              {Array.from({ length: CRITERION_CHIP_COUNT }).map((_, i) => (
                <Skeleton
                  key={i}
                  animation='wave'
                  variant='rounded'
                  height={32}
                  width={110}
                  sx={{ borderRadius: '16px' }}
                />
              ))}
            </Box>
          </Box>
        </Box>

        {/* Official / Stable card skeletons */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
          }}
        >
          {Array.from({ length: 2 }).map((_, i) => (
            <Box key={i} sx={{ p: 2, borderRadius: 1, height: '100%' }}>
              <CriterionHeaderSkeleton />
              <Skeleton
                animation='wave'
                variant='text'
                sx={{ fontSize: '1rem', width: '70%', mb: 1 }}
              />
              <Skeleton
                animation='wave'
                variant='text'
                sx={{ fontSize: '1rem' }}
              />
              <Skeleton
                animation='wave'
                variant='text'
                sx={{ fontSize: '1rem', width: '85%' }}
              />
            </Box>
          ))}
        </Box>

        {/* Available card skeleton: summary line, heatmap, legend */}
        <Box sx={{ p: 2, mt: 2, borderRadius: 1 }}>
          {/* Two chips: the uptime figure sits beside the status chip. */}
          <CriterionHeaderSkeleton chipCount={2} />
          <Skeleton
            animation='wave'
            variant='text'
            sx={{ fontSize: '1rem', width: '80%', mb: 2 }}
          />
          <Box sx={{ width: '100%', aspectRatio: HEATMAP_ASPECT_RATIO }}>
            <Skeleton
              animation='wave'
              variant='rounded'
              width='100%'
              height='100%'
            />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                animation='wave'
                variant='text'
                sx={{ fontSize: '0.75rem', width: '120px' }}
              />
            ))}
          </Box>
        </Box>

        {/* Compliant card skeleton: summary line and the report link */}
        <Box sx={{ p: 2, mt: 2, borderRadius: 1 }}>
          <CriterionHeaderSkeleton />
          <Skeleton
            animation='wave'
            variant='text'
            sx={{ fontSize: '1rem', width: '75%' }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Skeleton
              animation='wave'
              variant='text'
              sx={{ fontSize: '0.875rem', width: '200px' }}
            />
          </Box>
        </Box>
      </Box>
    </Container>
  );
}

/** Criterion card header: the title on the left, its chips on the right. */
function CriterionHeaderSkeleton({
  chipCount = 1,
}: {
  chipCount?: number;
}): React.ReactElement {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 1,
        mb: 2,
      }}
    >
      <Skeleton
        animation='wave'
        variant='text'
        sx={{ fontSize: '1.25rem', width: '160px' }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {Array.from({ length: chipCount }).map((_, i) => (
          <Skeleton
            key={i}
            animation='wave'
            variant='rounded'
            height={24}
            width={80}
            sx={{ borderRadius: '16px' }}
          />
        ))}
      </Box>
    </Box>
  );
}
