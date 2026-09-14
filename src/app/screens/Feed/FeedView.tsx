import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';

// Components
import DataQualitySummary from './components/DataQualitySummary';
import FeedDetailHeader from './components/FeedDetailHeader';
import FeedSummary from './components/FeedSummary';
import ScrollToTop from './components/ScrollToTop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Utils
import {
  type AllFeedType,
  type GBFSFeedType,
  type GTFSFeedType,
  type GTFSRTFeedType,
  isGtfsFeedType,
  isGtfsOrGtfsRtFeedType,
} from '../../services/feeds/utils';
import ClientDownloadButton from './components/ClientDownloadButton';
import RevalidateCacheButton from './components/RevalidateCacheButton';
import { type components } from '../../services/feeds/types';
import ClientQualityReportButton from './components/ClientQualityReportButton';
import ClientQualityAnalysisButton from './components/ClientQualityAnalysisButton';
import ClientSubscribeControls from './components/ClientSubscribeControls';
import {
  formatProvidersSorted,
  getBoundingBox,
  getLatestDataset,
} from './Feed.functions';
import dynamic from 'next/dynamic';
import { ContentBox } from '../../components/ContentBox';
import { getRemoteConfigValues } from '../../../lib/remote-config.server';
import SectionContainer from '../../components/SectionContainer';

const CoveredAreaMap = dynamic(
  async () =>
    await import('../../components/CoveredAreaMap').then((mod) => mod.default),
  {},
);

const AssociatedFeeds = dynamic(
  async () =>
    await import('./components/AssociatedFeeds').then((mod) => mod.default),
  {},
);

const GbfsVersions = dynamic(
  async () =>
    await import('./components/GbfsVersions').then((mod) => mod.default),
  {},
);

const PreviousDatasets = dynamic(
  async () =>
    await import('./components/PreviousDatasets').then((mod) => mod.default),
  {},
);

const WarningContentBox = dynamic(
  async () =>
    await import('../../components/WarningContentBox').then(
      (mod) => mod.WarningContentBox,
    ),
  {},
);

interface Props {
  feed: AllFeedType;
  initialDatasets?: Array<components['schemas']['GtfsDataset']>;
  relatedFeeds?: GTFSFeedType[];
  relatedGtfsRtFeeds?: GTFSRTFeedType[];
  totalRoutes?: number;
  routeTypes?: string[];
  reliability?: components['schemas']['FeedReliabilityReport'];
  isMobilityDatabaseAdmin?: boolean;
}

type LatestDatasetFull = components['schemas']['GtfsDataset'] | undefined;

export default async function FeedView({
  feed,
  initialDatasets,
  relatedFeeds = [],
  relatedGtfsRtFeeds = [],
  totalRoutes,
  routeTypes,
  reliability,
  isMobilityDatabaseAdmin = false,
}: Props): Promise<React.ReactElement> {
  if (feed == undefined) notFound();
  const [t, tGbfs, config] = await Promise.all([
    getTranslations('feeds'),
    getTranslations('gbfs'),
    getRemoteConfigValues(),
  ]);

  // Pinned on the server so the six-month "building record" branch in the
  // criterion copy resolves to the same instant during SSR and hydration.
  const now = new Date();

  // Basic derived data
  const sortedProviders = formatProvidersSorted(feed.provider ?? '');

  const downloadLatestUrl =
    feed?.data_type === 'gtfs'
      ? (feed as GTFSFeedType)?.latest_dataset?.hosted_url
      : feed?.source_info?.producer_url;

  const gbfsOpenFeedUrlElement = (): React.ReactElement => {
    if (gbfsAutodiscoveryUrl == undefined) {
      return <></>;
    }
    return (
      <Button
        disableElevation
        variant='contained'
        href={gbfsAutodiscoveryUrl}
        target='_blank'
        rel='noreferrer'
        endIcon={<OpenInNewIcon></OpenInNewIcon>}
      >
        {tGbfs('openAutoDiscoveryUrl')}
      </Button>
    );
  };

  const gbfsAutodiscoveryUrl =
    feed?.data_type === 'gbfs'
      ? (feed as GBFSFeedType)?.source_info?.producer_url
      : undefined; // Simplified

  const boundingBox = getBoundingBox(feed);

  const latestDataset: LatestDatasetFull = getLatestDataset(
    feed,
    initialDatasets,
  );

  const hasFeedRedirect = feed?.redirects != null && feed.redirects.length > 0;
  const hasDatasets =
    initialDatasets != undefined && initialDatasets.length > 0;

  return (
    <Container
      component='main'
      sx={{ width: '100%', m: 'auto', px: 0 }}
      maxWidth='xl'
    >
      <ScrollToTop />
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <SectionContainer maxWidth='xl'>
          <Box sx={{ position: 'relative' }}>
            <FeedDetailHeader feed={feed} sortedProviders={sortedProviders} />

            {isGtfsFeedType(feed) && (
              <DataQualitySummary
                feedStatus={feed.status}
                isOfficialFeed={feed.official}
                latestDataset={latestDataset}
                feedId={feed.id ?? ''}
                feedDataType={feed.data_type ?? 'gtfs'}
                hasSeal={feed.reliability_seal?.has_seal}
              />
            )}

            {/* Warnings */}
            {feed.data_type === 'gtfs' && !hasDatasets && !hasFeedRedirect && (
              <WarningContentBox>
                {t.rich('unableToDownloadFeed', {
                  link: (chunks) => (
                    <Button
                      variant='text'
                      className='inline'
                      href='/contribute'
                    >
                      {chunks}
                    </Button>
                  ),
                })}
              </WarningContentBox>
            )}
            {hasFeedRedirect && (
              <Grid size={12}>
                <WarningContentBox>
                  {t.rich('feedHasBeenReplaced', {
                    link: (chunks) => (
                      <Button
                        variant='text'
                        className='inline'
                        href={`/feeds/${feed?.redirects?.[0]?.target_id}`}
                      >
                        {chunks}
                      </Button>
                    ),
                  })}
                </WarningContentBox>
              </Grid>
            )}

            {/* CTA Buttons */}
            <Box
              sx={{
                my: 3,
                width: '100%',
                display: 'flex',
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
                gap: 1,
                borderTop: `1px solid`,
                borderColor: 'divider',
                pt: 3,
              }}
            >
              {feed.data_type === 'gtfs' &&
                downloadLatestUrl != null &&
                downloadLatestUrl.length > 0 && (
                  <ClientDownloadButton url={downloadLatestUrl} />
                )}
              {isGtfsFeedType(feed) && config.enableSealOfReliability && (
                <ClientQualityAnalysisButton
                  feedId={feed.id ?? ''}
                  feedDataType={feed.data_type ?? 'gtfs'}
                />
              )}
              {latestDataset?.validation_report?.url_html != null &&
                latestDataset.validation_report.url_html.length > 0 && (
                  <ClientQualityReportButton
                    url={latestDataset.validation_report.url_html}
                  />
                )}
              {feed?.data_type === 'gbfs' && <>{gbfsOpenFeedUrlElement()}</>}
              {feed.id != null && <ClientSubscribeControls feedId={feed.id} />}
            </Box>

            <Grid size={12}>
              <Box
                sx={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: {
                    xs:
                      feed.data_type === 'gtfs_rt'
                        ? 'column'
                        : 'column-reverse',
                    md: feed.data_type === 'gtfs_rt' ? 'row' : 'row-reverse',
                  },
                  gap: 2,
                  flexWrap: 'nowrap',
                  justifyContent: 'space-between',
                  mb: 4,
                }}
              >
                {(feed.data_type === 'gtfs' || feed.data_type === 'gbfs') && (
                  <CoveredAreaMap
                    boundingBox={boundingBox}
                    latestDataset={latestDataset}
                    feed={feed}
                    totalRoutes={totalRoutes}
                  />
                )}
                <Box sx={{ width: { xs: '100%', md: '475px' } }}>
                  <FeedSummary
                    feed={feed}
                    sortedProviders={sortedProviders}
                    latestDataset={latestDataset}
                    autoDiscoveryUrl={gbfsAutodiscoveryUrl}
                    totalRoutes={totalRoutes}
                    routeTypes={routeTypes}
                    enableSealOfReliability={config.enableSealOfReliability}
                    reliability={reliability}
                    now={now}
                  />
                </Box>
                {feed?.data_type === 'gtfs_rt' && (
                  <AssociatedFeeds
                    feeds={relatedFeeds.filter((f) => f?.id !== feed.id)}
                    gtfsRtFeeds={relatedGtfsRtFeeds.filter(
                      (f) => f?.id !== feed.id,
                    )}
                  />
                )}
              </Box>
            </Grid>

            {feed?.data_type === 'gbfs' && (
              <GbfsVersions feed={feed as GBFSFeedType}></GbfsVersions>
            )}

            {feed.data_type === 'gtfs' && (
              <Grid size={12}>
                <PreviousDatasets
                  initialDatasets={initialDatasets}
                  feedId={feed.id ?? ''}
                />
              </Grid>
            )}
          </Box>
        </SectionContainer>
      </Box>
      <Box
        sx={{
          mt: 4,
          pt: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        {latestDataset?.validation_report?.validated_at != null && (
          <Typography
            data-testid='last-updated'
            variant='caption'
            color='text.secondary'
            component='div'
          >
            {`${t('qualityReportUpdated')}: ${new Date(
              latestDataset.validation_report.validated_at,
            ).toDateString()}`}
          </Typography>
        )}
        {isGtfsOrGtfsRtFeedType(feed) &&
          feed.official_updated_at != undefined && (
            <Typography
              data-testid='last-updated'
              variant='caption'
              color='text.secondary'
              component='div'
            >
              {`${t('officialFeedUpdated')}: ${new Date(
                feed.official_updated_at,
              ).toDateString()}`}
            </Typography>
          )}
        {isGtfsFeedType(feed) && feed.reliability_seal?.earned_at != null && (
          <Typography
            data-testid='seal-earned-at'
            variant='caption'
            color='text.secondary'
            component='div'
          >
            {`${t('sealEarnedAt')}: ${new Date(
              feed.reliability_seal.earned_at,
            ).toDateString()}`}
          </Typography>
        )}
        {isGtfsFeedType(feed) && feed.reliability_seal?.lost_at != null && (
          <Typography
            data-testid='seal-lost-at'
            variant='caption'
            color='text.secondary'
            component='div'
          >
            {`${t('sealLostAt')}: ${new Date(
              feed.reliability_seal.lost_at,
            ).toDateString()}`}
          </Typography>
        )}
        {isGtfsFeedType(feed) &&
          feed.reliability_seal?.evaluated_at != null && (
            <Typography
              data-testid='seal-evaluated-at'
              variant='caption'
              color='text.secondary'
              component='div'
            >
              {`${t('sealEvaluatedAt')}: ${new Date(
                feed.reliability_seal.evaluated_at,
              ).toDateString()}`}
            </Typography>
          )}
        <Typography
          data-testid='page-generated'
          variant='caption'
          color='text.secondary'
          component='div'
        >
          {`${t('pageGeneratedAt')}: ${new Date().toUTCString().replace(' GMT', ' UTC')}`}
        </Typography>
      </Box>
      {isMobilityDatabaseAdmin && (
        <ContentBox
          title={'MobilityDatabase Admin Tools'}
          subtitle={
            <>
              This section is only visible to Mobility Data employees with an{' '}
              <code>@mobilitydata.org</code> email address. It contains tools
              for debugging and managing feed data
            </>
          }
          sx={{ mt: 4, backgroundColor: 'background.paper' }}
        >
          {feed?.id != null && feed?.id !== '' && (
            <RevalidateCacheButton feedId={feed.id} />
          )}
        </ContentBox>
      )}
    </Container>
  );
}
