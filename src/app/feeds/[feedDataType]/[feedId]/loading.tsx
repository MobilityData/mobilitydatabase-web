import { Box, Container, Skeleton } from '@mui/material';

export default function Loading(): React.ReactElement {
  return (
    <Container component="main" maxWidth="xl" sx={{ my: 4, bgcolor: 'background.paper', py: 2, borderRadius: 2, px: 1 }}>
      <Box>
        {/* Breadcrumb skeleton */}
        <Skeleton
          animation="wave"
          variant="text"
          sx={{ fontSize: '1rem', width: '200px', mb: 2 }}
        />
        
        {/* Feed title skeleton */}
        <Skeleton
          animation="wave"
          variant="text"
          sx={{ fontSize: '3rem', width: { xs: '100%', sm: '500px' }, mb: 1 }}
        />
        
        {/* Provider info skeleton */}
        <Skeleton
          animation="wave"
          variant="text"
          sx={{ fontSize: '1.2rem', width: '300px', mb: 1 }}
        />
        
        {/* Status chip skeleton */}
        <Skeleton
          animation="wave"
          variant="rounded"
          height={30}
          width={100}
          sx={{ mb: 3 }}
        />
        
        {/* Divider line */}
        <Box
          sx={{
            background: 'rgba(0,0,0,0.2)',
            height: '1px',
            width: '100%',
            mb: 3,
            mt: 2,
          }}
        />
        
        {/* Action buttons skeleton */}
        <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
          <Skeleton
            animation="wave"
            variant="rectangular"
            width={162}
            height={40}
          />
          <Skeleton
            animation="wave"
            variant="rectangular"
            width={162}
            height={40}
          />
        </Box>
        
        {/* Main content area skeleton */}
        <Box
          sx={{
            mt: 2,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
          }}
        >
          {/* Left panel skeleton */}
          <Skeleton
            animation="wave"
            variant="rectangular"
            sx={{ 
              width: { xs: '100%', sm: '50%' }, 
              height: '630px',
              borderRadius: 1
            }}
          />
          
          {/* Right panel skeleton */}
          <Skeleton
            animation="wave"
            variant="rectangular"
            sx={{
              width: { xs: '100%', sm: '50%' },
              height: '630px',
              borderRadius: 1
            }}
          />
        </Box>
      </Box>
    </Container>
  );
}