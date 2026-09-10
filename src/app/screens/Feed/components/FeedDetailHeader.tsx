import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Components
import FeedTitle from './FeedTitle';
import FeedVerificationChip from '../../../components/FeedVerificationChip';
import FeedNavigationControls from './FeedNavigationControls';

// Utils
import {
  type AllFeedType,
  type GTFSRTFeedType,
  isGtfsFeedType,
  isGtfsOrGtfsRtFeedType,
  isGtfsRtFeedType,
} from '../../../services/feeds/utils';

interface Props {
  feed: AllFeedType;
  sortedProviders: string[];
  /**
   * Breadcrumb leaf for feed sub-pages (e.g. the reliability analysis page).
   * When set, the feed id becomes a link back to the feed detail page.
   */
  currentPageLabel?: string;
  /** Where the back button goes when there is no history to pop. */
  backFallbackHref?: string;
}

/**
 * Shared header for feed detail pages: breadcrumbs, title and data
 * attributions.
 */
export default async function FeedDetailHeader({
  feed,
  sortedProviders,
  currentPageLabel,
  backFallbackHref,
}: Props): Promise<React.ReactElement> {
  if (feed == undefined) notFound();

  const [t, tCommon] = await Promise.all([
    getTranslations('feeds'),
    getTranslations('common'),
  ]);

  return (
    <>
      <FeedNavigationControls
        feedDataType={feed.data_type ?? ''}
        feedId={feed.id ?? ''}
        currentPageLabel={currentPageLabel}
        backFallbackHref={backFallbackHref}
      />

      <Box sx={{ mt: 1 }}>
        <FeedTitle
          sortedProviders={sortedProviders}
          feed={isGtfsOrGtfsRtFeedType(feed) ? feed : undefined}
        />
      </Box>

      {isGtfsFeedType(feed) && feed.feed_name !== '' && (
        <Grid size={12}>
          <Typography
            component={'h2'}
            sx={{
              fontWeight: 'bold',
              fontSize: { xs: 18, sm: 24 },
            }}
            data-testid='feed-name'
          >
            {feed.feed_name}
          </Typography>
        </Grid>
      )}

      {isGtfsRtFeedType(feed) && feed.official != null && (
        <Box sx={{ my: 1 }}>
          <FeedVerificationChip status={feed.official}></FeedVerificationChip>
        </Box>
      )}

      <Box>
        {feed.external_ids?.some((eId) => eId.source === 'tld') === true && (
          <Typography
            data-testid='transitland-attribution'
            variant={'caption'}
            width={'100%'}
            component={'div'}
          >
            {t('dataAttribution')}{' '}
            <a
              rel='noreferrer nofollow'
              target='_blank'
              href='https://www.transit.land/terms'
            >
              Transitland
            </a>
          </Typography>
        )}
        {feed.external_ids?.some((eId) => eId.source === 'ntd') === true && (
          <Typography
            data-testid='fta-attribution'
            variant={'caption'}
            width={'100%'}
            component={'div'}
          >
            {t('dataAttribution')}
            {' the United States '}
            <a
              rel='noreferrer nofollow'
              target='_blank'
              href='https://www.transit.dot.gov/ntd/data-product/2023-annual-database-general-transit-feed-specification-gtfs-weblinks'
            >
              National Transit Database
            </a>
          </Typography>
        )}
      </Box>

      {feed?.data_type === 'gtfs_rt' &&
        (feed as GTFSRTFeedType)?.entity_types != undefined && (
          <Grid size={12}>
            <Typography variant='h5'>
              {' '}
              {((feed as GTFSRTFeedType)?.entity_types ?? [])
                .map(
                  (entityType) =>
                    (
                      ({
                        tu: tCommon('gtfsRealtimeEntities.tripUpdates'),
                        vp: tCommon('gtfsRealtimeEntities.vehiclePositions'),
                        sa: tCommon('gtfsRealtimeEntities.serviceAlerts'),
                      }) as const satisfies Record<string, string>
                    )[entityType],
                )
                .join(` ${tCommon('and')} `)}
            </Typography>
          </Grid>
        )}
    </>
  );
}
