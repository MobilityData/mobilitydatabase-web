import { Box } from '@mui/material';
import { type ReactElement } from 'react';
import WorldGlobe from '../../components/WorldGlobe';

export default function WorldGlobePage(): ReactElement {
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        width: '100vw',
        height: '100vh',
        background:
          'radial-gradient(circle at 18% 20%, #eef4ff 0%, #dbe9ff 32%, #bed4ff 62%, #9ebfff 100%)',
      }}
    >
      <WorldGlobe allowFullscreen />
    </Box>
  );
}
