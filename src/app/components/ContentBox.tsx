import * as React from 'react';
import { Box, Typography, type SxProps } from '@mui/material';

export interface ContentBoxProps {
  title: string;
  subtitle?: React.ReactNode;
  width?: Record<string, string>;
  outlineColor?: string;
  padding?: Partial<SxProps>;
  margin?: string | number;
  sx?: SxProps;
  action?: React.ReactNode;
}

export const ContentBox = (
  props: React.PropsWithChildren<ContentBoxProps>,
): React.ReactElement => {
  return (
    <Box
      width={props.width ?? { xs: '100%', sm: '100%', md: '100%' }}
      sx={{
        backgroundColor: 'background.default',
        color: 'text.primary',
        borderRadius: '6px',
        border:
          props.outlineColor != null
            ? `2px solid ${props.outlineColor}`
            : 'none',
        p: props.padding ?? 5,
        m: props.margin ?? 0,
        fontSize: '18px',
        fontWeight: 700,
        mr: 0,
        ...props.sx,
      }}
    >
      {(props.title.trim() !== '' || props.action != null) && (
        <Typography
          variant='h5'
          sx={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1,
          }}
        >
          {props.title.trim() !== '' && <span>{props.title}</span>}
          {props.action != null && props.action}
        </Typography>
      )}
      {props.subtitle != null && (
        <Typography variant='subtitle1' sx={{ mb: 2 }}>
          {props.subtitle}
        </Typography>
      )}
      {props.children}
    </Box>
  );
};
