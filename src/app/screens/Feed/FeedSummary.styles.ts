import { Box, Card, styled, Typography } from '@mui/material';
import type { ElementType } from 'react';

export const GroupCard = styled(Card)(({ theme }) => ({
  background: theme.vars.palette.background.default,
  border: 'none',
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  '&:last-of-type': {
    marginBottom: 0,
  },
}));

export const GroupHeader = styled(Typography)<{ component?: ElementType }>(
  ({ theme }) => ({
    display: 'flex',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    alignItems: 'center',
    color: theme.vars.palette.text.secondary,
  }),
);

export const FeedLinkElement = styled(Box)(({ theme }) => ({
  width: 'calc(100% - 16px)',
  marginLeft: '16px',
}));
