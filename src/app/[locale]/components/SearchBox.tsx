'use client';

import * as React from 'react';
import { Box, Button, TextField, InputAdornment } from '@mui/material';
import { Search } from '@mui/icons-material';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export default function SearchBox(): React.ReactElement {
  const [searchInputValue, setSearchInputValue] = useState('');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const handleSearch = (): void => {
    const encodedURI = encodeURIComponent(searchInputValue.trim());
    if (encodedURI.length === 0) {
      router.push('/feeds');
    } else {
      router.push(`/feeds?q=${encodedURI}`);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <TextField
        sx={{
          width: '80%',
          mt: 6,
          fieldset: {
            borderColor: 'primary.main',
          },
        }}
        value={searchInputValue}
        onChange={(e) => {
          setSearchInputValue(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder='e.g. "New York" or "Carris Metropolitana"'
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position={'start'}>
                <Search />
              </InputAdornment>
            ),
          },
        }}
      />
      <Button
        sx={{
          mt: 6,
          py: 1.5,
          ml: 1,
          height: 55,
          boxShadow: 0,
        }}
        variant='contained'
        color='primary'
        onClick={handleSearch}
      >
        {tCommon('search')}
      </Button>
    </Box>
  );
}
