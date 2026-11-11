'use client';

import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
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
import LinkPendingIndicator from './LinkPendingIndicator';
import {
  filterByName,
  type ChildrenKind,
  type FeedCountDataType,
} from '../lib/location-directory';

export interface LocationChildCount {
  dataType: FeedCountDataType;
  count: number;
  /** Locale-formatted, rendered bold. */
  formattedCount: string;
  /** e.g. "GTFS-RT". */
  typeLabel: string;
}

export interface LocationChildItem {
  /** Unique among siblings (the href). */
  key: string;
  name: string;
  /** Emoji flag, countries only. */
  flag?: string;
  href: string;
  /** e.g. "8 feeds", with the number in a <strong>. */
  totalLabel: ReactNode;
  /** Plain-text counts; chips are kept for the page summary. */
  counts: LocationChildCount[];
}

// Bold, primary-colored numbers stand out from their secondary-colored labels.
const countNumberSx = {
  '& strong': { fontWeight: 700, color: 'text.primary' },
} as const;

interface Props {
  /** Already sorted, most feeds first. */
  items: LocationChildItem[];
  /** Names the search box after the level it filters. */
  kind: ChildrenKind;
}

/** Searchable, scrollable grid of child locations. */
export default function LocationChildrenList({
  items,
  kind,
}: Props): ReactElement {
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
        placeholder={t(`childrenSearchPlaceholder.${kind}`)}
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
        sx={{
          mb: 1,
          maxWidth: { md: 480 },
          // White in light mode, like the cards below; the section is paper.
          '& .MuiInputBase-root': { bgcolor: 'background.default' },
        }}
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
              <li key={item.key}>
                <Card sx={{ height: '100%', bgcolor: 'background.default' }}>
                  <CardActionArea
                    component={Link}
                    href={item.href}
                    // A node can list hundreds of children: no viewport
                    // prefetch, same as the feed links in SearchTable.
                    prefetch={false}
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
                        sx={{ whiteSpace: 'nowrap', ...countNumberSx }}
                      >
                        {item.totalLabel}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        columnGap: 1.5,
                        rowGap: 0.5,
                      }}
                    >
                      {item.counts.map(
                        ({ dataType, count, formattedCount, typeLabel }) => (
                          <Typography
                            key={dataType}
                            component='span'
                            variant='body2'
                            data-testid={`feed-count-${dataType}`}
                            color={
                              count > 0 ? 'text.secondary' : 'text.disabled'
                            }
                            // Zero counts stay fully disabled.
                            sx={count > 0 ? countNumberSx : undefined}
                          >
                            <strong>{formattedCount}</strong> {typeLabel}
                          </Typography>
                        ),
                      )}
                    </Box>
                    <LinkPendingIndicator
                      ariaLabel={t('childLoadingAria', { name: item.name })}
                    />
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
