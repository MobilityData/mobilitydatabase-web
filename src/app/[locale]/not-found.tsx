'use client';

import { Box, Button, Container, Typography } from '@mui/material';
import Link from 'next/link';
import SearchIcon from '@mui/icons-material/Search';
import HomeIcon from '@mui/icons-material/Home';

export default function NotFound(): React.ReactElement {
  return (
    <Container
      maxWidth='md'
      sx={{
        py: { xs: 8, md: 14 },
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Typography
        variant='h1'
        sx={{
          fontSize: { xs: '4rem', md: '6rem' },
          fontWeight: 700,
          color: 'primary.main',
          lineHeight: 1,
          mb: 2,
        }}
      >
        404
      </Typography>
      <Typography
        variant='h4'
        component='h2'
        sx={{
          fontWeight: 600,
          mb: 2,
        }}
      >
        Feed or Page Not Found
      </Typography>
      <Typography
        variant='body1'
        color='text.secondary'
        sx={{
          maxWidth: 540,
          mb: 4,
          fontSize: '1.1rem',
        }}
      >
        The feed or page you are looking for does not exist or may have been moved.
        Try searching our catalog or explore available feeds.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button
          component={Link}
          href='/feeds'
          variant='contained'
          color='primary'
          startIcon={<SearchIcon />}
          size='large'
        >
          Browse All Feeds
        </Button>
        <Button
          component={Link}
          href='/'
          variant='outlined'
          color='primary'
          startIcon={<HomeIcon />}
          size='large'
        >
          Return Home
        </Button>
      </Box>
    </Container>
  );
}
