import { Box, type SxProps, Typography } from '@mui/material';

export interface AssociatedFeedsProps {
  title?: string;
  subtitle?: string;
  sx?: SxProps;
}

export function AccountSectionContainer({
  title,
  subtitle,
  action,
  children,
  sx,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  sx?: SxProps;
}): React.ReactElement {
  return (
    <Box
      sx={{
        backgroundColor: 'background.paper',
        px: 3,
        py: 2,
        borderRadius: 1,
        ...sx,
      }}
    >
      {(title != null || action != null) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: 1,
          }}
        >
          <Box>
            {title != null && (
              <Typography
                variant='sectionTitle'
                gutterBottom={subtitle == null}
              >
                {title}
              </Typography>
            )}
            {subtitle != null && (
              <Typography variant='subtitle1' gutterBottom>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action != null && <Box sx={{ flexShrink: 0, ml: 2 }}>{action}</Box>}
        </Box>
      )}
      {children}
    </Box>
  );
}
