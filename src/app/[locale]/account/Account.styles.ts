import { type SxProps, type Theme } from '@mui/material/styles';

export const codeBlockSx: SxProps<Theme> = {
  fontFamily: 'monospace',
  backgroundColor: '#121c2d',
  color: '#d7deea',
  p: '20px',
  borderRadius: '5px',
  mt: '20px',
  wordWrap: 'break-word',
};

export const codeBlockContentSx: SxProps<Theme> = {
  fontFamily: 'monospace',
  wordWrap: 'break-word',
  width: '60vw',
};

export const tokenDisplayElementSx: SxProps<Theme> = (theme) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  m: '5px',
  px: '15px',
  wordWrap: 'break-word',
  width: '100%',
  maxWidth: '610px',
  backgroundColor: theme.vars.palette.background.paper,
  p: 2,
  borderRadius: '6px',
  border: `1px solid ${theme.vars.palette.primary.main}`,
});

export const tokenActionButtonsSx: SxProps<Theme> = {
  alignSelf: 'baseline',
};
