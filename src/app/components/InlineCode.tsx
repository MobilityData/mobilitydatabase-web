import { Box } from '@mui/material';
import { type ReactElement, type ReactNode } from 'react';

const inlineCodeStyle = {
  fontFamily: 'var(--font-ibm-plex-mono)',
  fontSize: '0.85em',
  backgroundColor: 'action.selected',
  borderRadius: '4px',
  px: 0.5,
  py: 0.15,
  whiteSpace: 'nowrap',
} as const;

export default function InlineCode({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <Box component='code' sx={inlineCodeStyle}>
      {children}
    </Box>
  );
}
