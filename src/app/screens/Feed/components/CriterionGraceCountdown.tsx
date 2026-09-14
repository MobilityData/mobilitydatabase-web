import * as React from 'react';
import { Alert, AlertTitle } from '@mui/material';

export interface CriterionGraceCountdownProps {
  /** What is left to do and by when, e.g. "20 days left to resolve 3 errors". */
  title: string;
  /** What happens if it isn't done in time. */
  description: string;
}

/**
 * The deadline notice a criterion shows while it is inside a grace period.
 *
 * A warning Alert, the same shape the grace periods are documented with on
 * the "how it is calculated" page, so the same rule reads the same way
 * wherever a producer meets it. Warning rather than error because the seal is
 * still held - the failure only counts once the window elapses.
 */
export default function CriterionGraceCountdown({
  title,
  description,
}: CriterionGraceCountdownProps): React.ReactElement {
  return (
    <Alert
      data-testid='criterion-grace-countdown'
      severity='warning'
      sx={{ mt: 2 }}
    >
      <AlertTitle>{title}</AlertTitle>
      {description}
    </Alert>
  );
}
