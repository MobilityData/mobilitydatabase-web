import { type ReactElement } from 'react';
import { Box, Chip } from '@mui/material';
import { type FeedCountDataType } from '../lib/location-directory';

export interface FeedCountChip {
  dataType: FeedCountDataType;
  count: number;
  /** Already formatted, e.g. "42 GTFS Schedule". */
  label: string;
}

interface Props {
  chips: FeedCountChip[];
  size?: 'small' | 'medium';
  ariaLabel?: string;
}

/**
 * GTFS / GTFS-RT / GBFS counts as outlined chips. Hook-free, so it renders in
 * both server and client components.
 */
export default function FeedCountChips({
  chips,
  size = 'medium',
  ariaLabel,
}: Props): ReactElement {
  return (
    <Box
      aria-label={ariaLabel}
      role={ariaLabel != undefined ? 'group' : undefined}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
    >
      {chips.map(({ dataType, count, label }) => (
        <Chip
          key={dataType}
          data-testid={`feed-count-${dataType}`}
          label={label}
          size={size}
          variant='outlined'
          color={count > 0 ? 'primary' : 'default'}
          sx={count > 0 ? { fontWeight: 700 } : { color: 'text.disabled' }}
        />
      ))}
    </Box>
  );
}
