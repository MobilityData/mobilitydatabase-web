import * as React from 'react';
import Box from '@mui/material/Box';

export default function GTFSFeatureAnalytics(): React.ReactElement {
  return (
    <Box sx={{ mx: 6, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flexGrow: 1, width: '100%', minHeight: '80vh' }}>
        <iframe
          src='https://community.mobilitydata.org/gtfs-features'
          title='GTFS Features Metrics'
          style={{
            width: '100%',
            height: '100%',
            minHeight: '80vh',
            border: 'none',
            display: 'block',
          }}
        />
      </Box>
    </Box>
  );
}