import { Box, Button } from '@mui/material';
import { type ReactElement } from 'react';

/**
 * Tour and fullscreen controls shared by the globe and the flat map.
 * Fullscreen is a hands-off presentation, so the controls hide there, and
 * preview keeps the embedded view uncluttered: no tour button.
 */
export function MapToolbar({
  preview,
  allowFullscreen,
  isFullscreen,
  tourMode,
  onToggleTour,
  onFullscreen,
}: {
  preview: boolean;
  allowFullscreen: boolean;
  isFullscreen: boolean;
  tourMode: boolean;
  onToggleTour: () => void;
  onFullscreen: () => void;
}): ReactElement | null {
  if (isFullscreen) return null;
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        zIndex: 3,
        display: 'flex',
        justifyContent: 'space-between',
        pointerEvents: 'none',
        '& > *': { pointerEvents: 'auto' },
      }}
    >
      {!preview && (
        <Button
          variant='contained'
          size='small'
          onClick={onToggleTour}
          aria-pressed={tourMode}
        >
          {tourMode ? 'Stop tour' : 'Auto tour'}
        </Button>
      )}
      {allowFullscreen && (
        <Button variant='contained' size='small' onClick={onFullscreen}>
          Fullscreen
        </Button>
      )}
    </Box>
  );
}
