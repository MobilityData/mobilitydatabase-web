'use client';

import { useMemo, useState, type ReactElement } from 'react';
import {
  Box,
  Card,
  CardActionArea,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslations } from 'next-intl';
import { Link } from '../../../../i18n/navigation';
import FeedCountChips, { type FeedCountChip } from './FeedCountChips';
import { filterByName } from '../lib/location-directory';

export interface LocationChildItem {
  slug: string;
  name: string;
  /** Emoji flag, countries only. */
  flag?: string;
  href: string;
  totalLabel: string;
  chips: FeedCountChip[];
}

interface Props {
  /** Already sorted, most feeds first. */
  items: LocationChildItem[];
}

/** Searchable, scrollable grid of child locations. */
export default function LocationChildrenList({ items }: Props): ReactElement {
  const t = useTranslations('locations');
  const [query, setQuery] = useState('');
  const visibleItems = useMemo(
    () => filterByName(items, query),
    [items, query],
  );

  return (
    <>
      <TextField
        type='search'
        size='small'
        fullWidth
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder={t('childrenSearchPlaceholder')}
        slotProps={{
          htmlInput: {
            'aria-label': t('childrenSearchAria'),
            'aria-controls': 'location-children',
            'data-testid': 'location-children-search',
          },
          input: {
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon />
              </InputAdornment>
            ),
          },
        }}
        sx={{ mb: 1, maxWidth: { md: 480 } }}
      />
      <Typography
        variant='body2'
        color='text.secondary'
        role='status'
        sx={{ mb: 1 }}
      >
        {query.trim() !== ''
          ? t('childrenSearchResults', { count: visibleItems.length })
          : null}
      </Typography>
      <Box
        sx={{
          maxHeight: { xs: 420, md: 520 },
          overflowY: 'auto',
          // Room for the card shadows, which the scroll box would clip.
          p: 1,
          mx: -1,
        }}
      >
        {visibleItems.length > 0 ? (
          <Box
            component='ul'
            id='location-children'
            data-testid='location-children'
            sx={{
              listStyle: 'none',
              p: 0,
              m: 0,
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(3, minmax(0, 1fr))',
                lg: 'repeat(4, minmax(0, 1fr))',
              },
              gap: 2,
            }}
          >
            {visibleItems.map((item) => (
              <li key={item.slug}>
                <Card sx={{ height: '100%', bgcolor: 'background.default' }}>
                  <CardActionArea
                    component={Link}
                    href={item.href}
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      justifyContent: 'flex-start',
                      gap: 1,
                      p: 2,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Typography
                        component='span'
                        sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}
                      >
                        {item.flag != undefined
                          ? `${item.flag} ${item.name}`
                          : item.name}
                      </Typography>
                      <Typography
                        component='span'
                        variant='body2'
                        color='text.secondary'
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        {item.totalLabel}
                      </Typography>
                    </Box>
                    <FeedCountChips chips={item.chips} size='small' />
                  </CardActionArea>
                </Card>
              </li>
            ))}
          </Box>
        ) : (
          <Typography color='text.secondary' sx={{ py: 2 }}>
            {t('childrenSearchEmpty', { query: query.trim() })}
          </Typography>
        )}
      </Box>
    </>
  );
}
