'use client';

import { type ReactElement } from 'react';
import { Box, Pagination, PaginationItem, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import SearchTable from '../../../screens/Feeds/SearchTable';
import { useSealOfReliabilityFilterAccess } from '../../../hooks/useSealOfReliabilityFilterAccess';
import { type SearchFeedItem } from '../../../services/feeds/utils';
import { Link } from '../../../../i18n/navigation';
import {
  buildLocationHref,
  FEEDS_SECTION_ID,
  getPageOffset,
  LOCATION_FEEDS_PAGE_SIZE,
} from '../lib/location-directory';

interface Props {
  feeds: SearchFeedItem[];
  total: number;
  page: number;
  pageCount: number;
  /** Slugs of the current node, used to build the page links. */
  slugs: string[];
}

/**
 * The feeds of a directory node in the same compact table as the /feeds
 * search (simple view), paginated with real links so every page is
 * crawlable and reflected in the URL.
 */
export default function LocationFeedsList({
  feeds,
  total,
  page,
  pageCount,
  slugs,
}: Props): ReactElement {
  const t = useTranslations('locations');
  // Same flag the /feeds search uses to show the seal badge on rows.
  const { isFeatureLive: isSealEnabled } = useSealOfReliabilityFilterAccess();

  if (feeds.length === 0) {
    return <Typography color='text.secondary'>{t('noFeeds')}</Typography>;
  }

  const start = getPageOffset(page) + 1;
  const end = Math.min(start + LOCATION_FEEDS_PAGE_SIZE - 1, total);

  return (
    <>
      <Typography
        variant='subtitle2'
        sx={{ fontWeight: 700, mb: 1 }}
        data-testid='location-feeds-range'
      >
        {t('resultsRange', { start, end, total })}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <SearchTable
          feedsData={{ total, results: feeds }}
          isSealEnabled={isSealEnabled}
        />
      </Box>
      {pageCount > 1 ? (
        <Pagination
          aria-label={t('paginationAria')}
          sx={{ mt: 2 }}
          color='primary'
          shape='rounded'
          page={page}
          count={pageCount}
          renderItem={(item) => (
            <PaginationItem
              component={Link}
              href={`${buildLocationHref(
                slugs,
                Math.min(Math.max(item.page ?? 1, 1), pageCount),
              )}#${FEEDS_SECTION_ID}`}
              {...item}
            />
          )}
        />
      ) : null}
    </>
  );
}
