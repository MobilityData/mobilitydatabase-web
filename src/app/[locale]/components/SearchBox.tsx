'use client';

import * as React from 'react';
import { Box, IconButton, TextField, InputAdornment } from '@mui/material';
import { ArrowUpward, Search } from '@mui/icons-material';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import './SearchBorderShine.css';

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
          // A primary border and a soft primary-tinted shadow, so the field
          // stands out over the hero map behind it. The paired selector
          // beats the theme's divider-colored fieldset override, which would
          // otherwise win over a plain `fieldset` rule.
          '.MuiOutlinedInput-root fieldset, .MuiOutlinedInput-root:hover fieldset':
            {
              borderColor: 'primary.main',
              borderWidth: 2,
            },
          '.MuiOutlinedInput-root': {
            backgroundColor: 'background.default',
            boxShadow:
              '0 4px 14px color-mix(in srgb, var(--mui-palette-primary-main) 16%, transparent)',
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
            className: 'search-border-shine',
            startAdornment: (
              <InputAdornment position={'start'}>
                <Search />
              </InputAdornment>
            ),
            endAdornment:
              searchInputValue.length > 0 ? (
                <InputAdornment position={'end'}>
                  <IconButton
                    aria-label={tCommon('search')}
                    onClick={handleSearch}
                    edge='end'
                    sx={{
                      // edge='end' pulls the button 12px right; keep 4px of
                      // that back so it doesn't hug the field's border.
                      mr: '-8px',
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': { bgcolor: 'primary.dark' },
                    }}
                  >
                    <ArrowUpward />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
          },
        }}
      />
    </Box>
  );
}
