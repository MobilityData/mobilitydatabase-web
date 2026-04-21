import { Container, styled } from '@mui/material';

export const ColoredContainer = styled(Container)(({ theme }) => ({
  background: theme.vars.palette.background.paper,
  borderRadius: '6px',
  paddingTop: theme.spacing(3),
  paddingBottom: theme.spacing(3),
  position: 'relative',
}));
