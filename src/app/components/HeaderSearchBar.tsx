'use client';

import * as React from 'react';
import { Box, IconButton, InputBase, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface Props {
  onOpenChange?: (open: boolean) => void;
}

export default function HeaderSearchBar({
  onOpenChange,
}: Props): React.ReactElement {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(undefined);
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslations('feeds');
  const tCommon = useTranslations('common');

  const setOpen = (open: boolean): void => {
    setSearchOpen(open);
    onOpenChange?.(open);
  };

  React.useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const handleSearchSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed !== '') {
      router.push(`/feeds?q=${encodeURIComponent(trimmed)}`);
    }
    setOpen(false);
    setSearchValue('');
  };

  const handleSearchIconClick = (): void => {
    if (searchOpen) {
      if (searchValue.trim() !== '') {
        router.push(`/feeds?q=${encodeURIComponent(searchValue.trim())}`);
        setOpen(false);
        setSearchValue('');
      } else {
        setOpen(false);
      }
    } else {
      setOpen(true);
    }
  };

  return (
    <Box
      sx={{
        display: 'inline-flex',
        position: 'relative',
        mx: 1,
        verticalAlign: 'middle',
        zIndex: 2,
      }}
    >
      <Box
        component='form'
        onSubmit={handleSearchSubmit}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
          ...(searchOpen && {
            bgcolor: theme.vars.palette.background.paper,
            borderRadius: 1,
            boxShadow: 3,
            px: 1,
            py: 0.5,
            transform: 'translateY(-50%) translateX(8px)',
          }),
        }}
      >
        <InputBase
          inputRef={searchInputRef}
          value={searchValue}
          onChange={(e) => {
            setSearchValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setSearchValue('');
            }
          }}
          onBlur={() => {
            setOpen(false);
          }}
          placeholder={t('searchPlaceholder')}
          inputProps={{
            'aria-label': tCommon('search'),
            tabIndex: searchOpen ? 0 : -1,
          }}
          sx={{
            fontSize: theme.typography.body2.fontSize,
            width: searchOpen ? 280 : 0,
            opacity: searchOpen ? 1 : 0,
            overflow: 'hidden',
            transition: 'width 0.3s ease, opacity 0.25s ease',
            '& input': { p: '2px 4px' },
          }}
        />
        <IconButton
          size='small'
          color={searchValue.trim() !== '' ? 'primary' : 'inherit'}
          aria-label={tCommon('search')}
          type='button'
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={handleSearchIconClick}
        >
          <SearchIcon fontSize='small' />
        </IconButton>
      </Box>
    </Box>
  );
}
