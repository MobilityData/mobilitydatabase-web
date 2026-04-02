'use client';
import { useState, useTransition } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { revalidateFeedCache } from '../actions';

interface Props {
  feedId: string;
}

export default function RevalidateCacheButton({
  feedId,
}: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleClick = (): void => {
    setResult(null);

    startTransition(async () => {
      try {
        const res = await revalidateFeedCache(feedId);
        setResult(res);
      } catch {
        setResult({
          ok: false,
          message: 'Failed to revalidate the cache. Please try again.',
        });
      }
    });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        width: 'fit-content',
      }}
    >
      <Button variant='contained' onClick={handleClick} disabled={isPending}>
        {isPending ? 'Revalidating…' : 'Revalidate The Cache of This Page'}
      </Button>
      {result != null && !isPending && (
        <Typography
          variant='caption'
          color={result.ok ? 'success.main' : 'error.main'}
        >
          {result.message}
        </Typography>
      )}
    </Box>
  );
}
