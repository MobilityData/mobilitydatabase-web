import type React from 'react';
import { MenuItem, Typography, type Theme } from '@mui/material';
import { styled } from '@mui/material/styles';
import { type SystemStyleObject } from '@mui/system';
import { fontFamily } from '../Theme';

export const mobileNavElementStyle = (
  theme: Theme,
): SystemStyleObject<Theme> => ({
  width: '100%',
  justifyContent: 'flex-start',
  pl: 3,
  color: theme.vars.palette.text.primary,
});

export const animatedButtonStyling = (
  theme: Theme,
): SystemStyleObject<Theme> => ({
  minWidth: 'fit-content',
  px: 0,
  mx: { xs: 1.5, lg: 2 },
  fontFamily: fontFamily.secondary,
  '&:hover, &.active': {
    backgroundColor: 'transparent',
    '&::after': {
      transform: 'scaleX(1)',
      left: 0,
      right: 0,
      transformOrigin: 'left',
    },
  },
  '&.active.short': {
    '&::after': {
      right: '20px',
    },
  },
  '&::after': {
    content: '""',
    height: '2px',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.vars.palette.primary.main,
    opacity: 0.7,
    transition: 'transform 0.9s cubic-bezier(0.19, 1, 0.22, 1)',
    transform: 'scaleX(0)',
    transformOrigin: 'right',
    pointerEvents: 'none',
  },
});

export const headerDropdownMenuHeader = (): SystemStyleObject<Theme> => ({
  px: 2,
  pt: 1.5,
  pb: 0.5,
  display: 'block',
  color: 'text.disabled',
  lineHeight: 2,
});

export const HeaderMenuItemHeader = styled(Typography)(({ theme }) => ({
  paddingLeft: theme.spacing(2),
  paddingRight: theme.spacing(2),
  paddingTop: theme.spacing(1),
  color: theme.vars.palette.primary.main,
  fontWeight: 700,
  fontFamily: fontFamily.secondary,
}));

export const HeaderMenuItem = styled(MenuItem)<{
  component?: React.ElementType;
  href?: string;
  target?: string;
  rel?: string;
}>(() => ({
  fontFamily: fontFamily.secondary,
  opacity: 0.8,
  fontWeight: 500,
  '&:hover': {
    opacity: 1,
  },
})) as typeof MenuItem;
