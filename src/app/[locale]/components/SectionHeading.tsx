import { type ReactElement } from 'react';
import { Box, type SxProps, type Theme, Typography } from '@mui/material';

interface SectionHeadingProps {
  /** Referenced by the section's aria-labelledby. */
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  /** Small print under the description, e.g. how current the data is. */
  caveat?: string;
  /** Defaults to inheriting the section's text color. */
  eyebrowColor?: string;
  /** Merged over the wrapper, e.g. to tighten the bottom margin. */
  sx?: SxProps<Theme>;
}

/** Eyebrow + h2 used to open each landing page section. */
export default function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  caveat,
  eyebrowColor,
  sx,
}: SectionHeadingProps): ReactElement {
  return (
    <Box
      sx={[
        { mb: { xs: 4, md: 6 }, maxWidth: 720 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography
        sx={{
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontWeight: 700,
          fontSize: '0.8rem',
          opacity: eyebrowColor === undefined ? 0.8 : 1,
          color: eyebrowColor,
        }}
      >
        {eyebrow}
      </Typography>
      <Typography
        id={id}
        component='h2'
        sx={{
          fontWeight: 700,
          fontSize: { xs: '28px', md: '40px' },
          lineHeight: 1.2,
          mt: 1,
        }}
      >
        {title}
      </Typography>
      {description !== undefined && (
        <Typography sx={{ mt: 2, opacity: 0.85 }}>{description}</Typography>
      )}
      {caveat !== undefined && (
        <Typography sx={{ mt: 1, fontSize: '0.8rem', opacity: 0.6 }}>
          {caveat}
        </Typography>
      )}
    </Box>
  );
}
