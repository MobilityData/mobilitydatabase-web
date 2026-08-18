import { Typography, type TypographyProps } from '@mui/material';
import { type ReactElement } from 'react';

export default function CardSectionTitle({
  sx = [],
  ...props
}: TypographyProps): ReactElement {
  return (
    <Typography
      variant='body1'
      sx={[
        {
          display: 'flex',
          gap: 1,
          mb: 1,
          alignItems: 'center',
          color: 'text.secondary',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
}
