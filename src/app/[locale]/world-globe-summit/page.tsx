import { Box } from '@mui/material';
import { type ReactElement } from 'react';
import WorldGlobeSummit from '../../components/WorldGlobeSummit';

export default function WorldGlobeSummitPage(): ReactElement {
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        width: '100vw',
        height: '100vh',
        // MobilityData --color-bg (off-white). Brand uses no gradients.
        background: '#f7f7f7',
      }}
    >
      <WorldGlobeSummit allowFullscreen />
    </Box>
  );
}
