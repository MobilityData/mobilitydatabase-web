import {
  Box,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  type SxProps,
  type Theme,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  type AllFeedsType,
  getCountryLocationSummaries,
  getLocationName,
  type SearchFeedItem,
} from '../../services/feeds/utils';
import * as React from 'react';
import { FeedStatusIndicator } from '../../components/FeedStatus';
import { useTranslations } from 'next-intl';
import LockIcon from '@mui/icons-material/Lock';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import GtfsRtEntities from './GtfsRtEntities';
import { getEmojiFlag, type TCountryCode } from 'countries-list';
import OfficialChip from '../../components/OfficialChip';
import { getFeatureComponentDecorators } from '../../utils/consts';
import PopoverList from './PopoverList';
import ProviderTitle from './ProviderTitle';
import NextLinkComposed from 'next/link';
import { useRouter } from '../../../i18n/navigation';

export interface AdvancedSearchTableProps {
  feedsData: AllFeedsType | undefined;
  selectedFeatures: string[] | undefined;
  selectedGbfsVersions: string[] | undefined;
  selectedLicenseTags: string[] | undefined;
  isLoadingFeeds: boolean;
}

interface DetailsContainerProps {
  children: React.ReactNode;
  feedSearchItem: SearchFeedItem;
  selectedLicenseTags: string[];
}

const DetailsContainer = ({
  children,
  feedSearchItem,
  selectedLicenseTags,
}: DetailsContainerProps): React.ReactElement => {
  const licenseTags = feedSearchItem.source_info?.license_tags;
  const licenseTagsTitle =
    licenseTags != null && licenseTags.length > 0
      ? licenseTags.join(', ')
      : undefined;
  const matchingTags =
    licenseTags?.filter((tag) => selectedLicenseTags.includes(tag)) ?? [];
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'end',
        flexWrap: { xs: 'wrap', lg: 'nowrap' },
      }}
    >
      <Box sx={{ width: 'calc(100% - 100px' }}>{children}</Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          ml: { xs: 0, lg: 2 },
          minWidth: { xs: '100%', lg: '100px' },
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          pt: { xs: 1, lg: 0 },
        }}
      >
        {matchingTags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size='small'
            color='primary'
            variant='outlined'
            sx={{ opacity: 0.8 }}
          />
        ))}
        <Tooltip
          title={licenseTagsTitle ?? ''}
          placement='top-end'
          disableTouchListener={licenseTagsTitle == null}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            {licenseTagsTitle != null && (
              <InfoOutlinedIcon sx={{ fontSize: 14, opacity: 0.7 }} />
            )}
            <Typography
              variant='caption'
              sx={{ opacity: 0.7, textAlign: 'right' }}
            >
              {feedSearchItem.source_info?.license_id}
            </Typography>
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );
};

const renderGTFSDetails = (
  gtfsFeed: SearchFeedItem,
  selectedFeatures: string[],
  theme: Theme,
  selectedLicenseTags: string[],
): React.ReactElement => {
  const feedFeatures =
    gtfsFeed?.latest_dataset?.validation_report?.features ?? [];
  return (
    <DetailsContainer
      feedSearchItem={gtfsFeed}
      selectedLicenseTags={selectedLicenseTags}
    >
      {gtfsFeed?.feed_name != null && (
        <Typography
          variant='body1'
          sx={feedFeatures.length > 0 ? { mb: 1 } : { mb: 0 }}
        >
          {gtfsFeed.feed_name}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {gtfsFeed?.latest_dataset?.validation_report?.features?.map(
          (feature: string, index: number) => {
            const featureData = getFeatureComponentDecorators(feature);
            return (
              <Tooltip
                title={`Group: ${featureData.component}`}
                key={index}
                placement='top'
              >
                <Chip
                  label={feature}
                  key={index}
                  size='small'
                  sx={{
                    background: featureData.color,
                    border: selectedFeatures.includes(feature)
                      ? `2px solid ${theme.vars.palette.primary.main}`
                      : 'none',
                    color: 'black',
                  }}
                />
              </Tooltip>
            );
          },
        )}
      </Box>
    </DetailsContainer>
  );
};

const renderGTFSRTDetails = (
  gtfsRtFeed: SearchFeedItem,
  selectedLicenseTags: string[],
): React.ReactElement => {
  return (
    <DetailsContainer
      feedSearchItem={gtfsRtFeed}
      selectedLicenseTags={selectedLicenseTags}
    >
      <GtfsRtEntities
        entities={gtfsRtFeed?.entity_types}
        includeName={true}
      ></GtfsRtEntities>
    </DetailsContainer>
  );
};

const renderGBFSDetails = (
  gbfsFeedSearchElement: SearchFeedItem,
  selectedGbfsVersions: string[],
  theme: Theme,
  selectedLicenseTags: string[],
): React.ReactElement => {
  return (
    <DetailsContainer
      feedSearchItem={gbfsFeedSearchElement}
      selectedLicenseTags={selectedLicenseTags}
    >
      {gbfsFeedSearchElement.versions?.map((version: string, index: number) => (
        <Chip
          label={'v' + version}
          key={index}
          size='small'
          variant='outlined'
          sx={{
            mr: 1,
            border: selectedGbfsVersions.includes('v' + version)
              ? `2px solid ${theme.vars.palette.primary.main}`
              : '',
            color: theme.vars.palette.text.primary,
          }}
        />
      ))}
    </DetailsContainer>
  );
};

export default function AdvancedSearchTable({
  feedsData,
  selectedFeatures,
  selectedGbfsVersions,
  selectedLicenseTags,
  isLoadingFeeds,
}: AdvancedSearchTableProps): React.ReactElement {
  const t = useTranslations('feeds');
  const tCommon = useTranslations('common');
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [popoverData, setPopoverData] = React.useState<string[] | undefined>(
    undefined,
  );
  const [popoverTitle, setPopoverTitle] = React.useState<string | undefined>();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [showLoading, setShowLoading] = React.useState(false);
  const theme = useTheme();

  // Show loading state if navigation or feed loading is taking longer than 300ms to avoid flashing effect for fast transitions
  React.useEffect(() => {
    if (!isPending) {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowLoading(true);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [isPending]);

  const descriptionDividerStyle: SxProps = {
    py: 1,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    mt: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'baseline',
  };

  return (
    <>
      {showLoading && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(255,255,255,0.2)',
          }}
        >
          <CircularProgress variant='indeterminate' />
        </Box>
      )}
      {feedsData?.results?.map((feed, index) => {
        if (feed == null) {
          return <></>;
        }
        const hasGtfsFeatures =
          (feed?.latest_dataset?.validation_report?.features?.length ?? 0) > 0;
        const hasGbfsVersions = (feed.versions?.length ?? 0) > 0;

        return (
          <Card
            key={index}
            sx={{
              my: 2,
              width: '100%',
              display: 'block',
              textDecoration: 'none',
              bgcolor: 'background.default',
            }}
          >
            <CardActionArea
              sx={{ p: 1, opacity: showLoading || isLoadingFeeds ? 0.7 : 1 }}
              component={NextLinkComposed}
              href={`/feeds/${feed.data_type}/${feed.id}`}
              prefetch={false}
              onClick={(e) => {
                // Navigation to Feed Detail Page can have a delay
                // Show loading state to ease transition
                // This will be further reviewed
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)
                  return;
                e.preventDefault();
                startTransition(() => {
                  router.push(`/feeds/${feed.data_type}/${feed.id}`);
                });
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: {
                    xs: 'wrap-reverse',
                    sm: 'nowrap',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                  <Typography variant='h6' sx={{ fontWeight: 'bold', mr: 1 }}>
                    <ProviderTitle
                      feed={feed}
                      setPopoverData={(popoverData) => {
                        setPopoverTitle(
                          `${t('transitProvider')} - ${popoverData?.[0]}`,
                        );
                        setPopoverData(popoverData);
                      }}
                      setAnchorEl={(el) => {
                        setAnchorEl(el);
                      }}
                    ></ProviderTitle>
                  </Typography>

                  {feed.official === true && (
                    <OfficialChip isLongDisplay={false}></OfficialChip>
                  )}
                  {feed.data_type !== 'gbfs' && (
                    <FeedStatusIndicator
                      status={feed.status}
                    ></FeedStatusIndicator>
                  )}
                </Box>

                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  {feed.source_info?.authentication_type !== 0 && (
                    <Tooltip
                      title={t('authenticationRequired')}
                      placement='top'
                    >
                      <LockIcon></LockIcon>
                    </Tooltip>
                  )}
                  <Typography
                    variant='body1'
                    sx={{ mr: 1, fontWeight: 'bold' }}
                  >
                    {tCommon(`${feed.data_type}`)}
                  </Typography>
                </Box>
              </Box>
              <Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  {feed.locations != null && feed.locations?.length > 1 ? (
                    <>
                      {getCountryLocationSummaries(feed.locations).map(
                        (location, index) => {
                          const locationForCountry = feed.locations?.filter(
                            (l) => l.country_code === location.country_code,
                          );
                          return (
                            <Box
                              key={index}
                              sx={{ display: 'flex', alignItems: 'center' }}
                            >
                              <Typography
                                onMouseEnter={(event) => {
                                  setPopoverData(
                                    locationForCountry?.map(
                                      (l) =>
                                        `${l.municipality}, (${l.subdivision_name})`,
                                    ),
                                  );
                                  setAnchorEl(event.currentTarget);
                                  setPopoverTitle(location.country);
                                }}
                                onMouseLeave={() => {
                                  setPopoverData(undefined);
                                  setAnchorEl(null);
                                  setPopoverTitle(undefined);
                                }}
                              >
                                {getEmojiFlag(
                                  location.country_code as TCountryCode,
                                )}{' '}
                                {location.country}
                                <Typography
                                  sx={{
                                    fontStyle: 'italic',
                                    mr: 1,
                                    fontWeight: 'bold',
                                  }}
                                  variant='caption'
                                >
                                  &nbsp;(
                                  {locationForCountry?.length})
                                </Typography>
                              </Typography>
                            </Box>
                          );
                        },
                      )}
                    </>
                  ) : (
                    <Typography variant='body1'>
                      {getLocationName(feed.locations)}
                    </Typography>
                  )}
                </Box>
              </Box>
              <Box>
                {feed.data_type === 'gtfs' && (
                  <Box
                    sx={
                      hasGtfsFeatures ||
                      (feed.feed_name != null && feed.feed_name !== '')
                        ? descriptionDividerStyle
                        : {}
                    }
                  >
                    {renderGTFSDetails(
                      feed,
                      selectedFeatures ?? [],
                      theme,
                      selectedLicenseTags ?? [],
                    )}
                  </Box>
                )}
                {feed.data_type === 'gtfs_rt' && (
                  <Box sx={descriptionDividerStyle}>
                    {renderGTFSRTDetails(feed, selectedLicenseTags ?? [])}
                  </Box>
                )}

                {feed.data_type === 'gbfs' && (
                  <Box sx={hasGbfsVersions ? descriptionDividerStyle : {}}>
                    {renderGBFSDetails(
                      feed,
                      selectedGbfsVersions ?? [],
                      theme,
                      selectedLicenseTags ?? [],
                    )}
                  </Box>
                )}
              </Box>
            </CardActionArea>
          </Card>
        );
      })}
      {popoverData !== undefined && (
        <PopoverList
          popoverData={popoverData}
          anchorEl={anchorEl}
          title={popoverTitle ?? ''}
        ></PopoverList>
      )}
    </>
  );
}
