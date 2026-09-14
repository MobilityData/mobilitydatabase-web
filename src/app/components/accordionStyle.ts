import { type SxProps, type Theme } from '@mui/material';

export const accordionStyle: SxProps<Theme> = {
  boxShadow: 'none',
  background: 'transparent',
  borderBottom: '2px solid',
  borderColor: 'divider',
  '&:before': { display: 'none' },
  svg: { color: 'divider' },
};
