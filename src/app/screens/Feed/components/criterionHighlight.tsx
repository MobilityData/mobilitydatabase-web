import * as React from 'react';
import { Box } from '@mui/material';

/**
 * Renders the `<b>` tags a criterion's description carries.
 *
 * The descriptions are a sentence or two each, and a reader scanning six
 * criteria wants the part that decided the verdict - the days of overlap, the
 * errors found, the limit that was met - not the whole sentence. Tagging it
 * in the message rather than splitting the sentence into fragments keeps the
 * wording, and the placement of the emphasis, in the translators' hands.
 *
 * Passed to `t.rich`, which is what those descriptions are rendered with.
 */
export function highlight(chunks: React.ReactNode): React.ReactElement {
  return (
    <Box component='strong' sx={{ fontWeight: 700 }}>
      {chunks}
    </Box>
  );
}
