import { type Theme } from '@mui/material';
import { type SystemStyleObject } from '@mui/system';

export const verificationBadgeStyle = (
  theme: Theme,
): SystemStyleObject<Theme> => ({
  background: `linear-gradient(25deg, ${theme.vars.palette.primary.light}, ${theme.vars.palette.primary.dark})`,
  color: 'white',
});
