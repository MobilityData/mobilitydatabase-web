import { Chip } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { type ReactElement } from 'react';

interface ResultChipProps {
  passes: boolean;
  label: string;
}

export default function ResultChip({
  passes,
  label,
}: ResultChipProps): ReactElement {
  return (
    <Chip
      size='small'
      variant='outlined'
      color={passes ? 'success' : 'error'}
      icon={
        passes ? (
          <CheckCircleOutlineIcon fontSize='small' />
        ) : (
          <ErrorOutlineIcon fontSize='small' />
        )
      }
      label={label}
      sx={{ fontWeight: 700 }}
    />
  );
}
