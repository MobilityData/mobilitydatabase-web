'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Skeleton,
  Button,
  Typography,
  Fab,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Link from 'next/link';
import MapIcon from '@mui/icons-material/Map';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { WarningContentBox } from './WarningContentBox';
import { mapBoxPositionStyle } from '../screens/Feed/Feed.styles';
import dynamic from 'next/dynamic';
import { type GeoJSONData, type GeoJSONDataGBFS } from './MapGeoJSON';
import { useTranslations } from 'next-intl';
import { type LngLatTuple } from '../types';
import { useTheme } from '@mui/material/styles';
import {
  type GTFSFeedType,
  type AllFeedType,
  type GBFSFeedType,
  type GBFSVersionType,
} from '../services/feeds/utils';
import { OpenInNew } from '@mui/icons-material';
import { computeBoundingBox } from '../screens/Feed/Feed.functions';
import { displayFormattedDate } from '../utils/date';
import ModeOfTravelIcon from '@mui/icons-material/ModeOfTravel';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import { useRemoteConfig } from '../context/RemoteConfigProvider';
import { sendGAEvent } from '@next/third-parties/google';
import {
  getLatestGbfsVersion,
  type LatestDatasetLite,
} from './GtfsVisualizationMap.functions';

// Dynamically import Map and MapGeoJSON for code splitting and bundle size
// Useful since these components are rendered conditionally to the tab and will only import when on page
const GtfsVisualizationMap = dynamic(
  async () =>
    await import('./GtfsVisualizationMap').then(
      (mod) => mod.GtfsVisualizationMap,
    ),
  { ssr: false },
);
const MapGeoJSON = dynamic(
  async () => await import('./MapGeoJSON').then((mod) => mod.MapGeoJSON),
  { ssr: false },
);
const Map = dynamic(async () => await import('./Map').then((mod) => mod.Map), {
  ssr: false,
});

interface CoveredAreaMapProps {
  boundingBox?: LngLatTuple[];
  latestDataset?: LatestDatasetLite;
  feed: AllFeedType;
  totalRoutes?: number;
}

export const fetchGeoJson = async (
  latestDatasetUrl: string,
): Promise<GeoJSONData | GeoJSONDataGBFS> => {
  const geoJsonUrl = latestDatasetUrl
    .split('/')
    .slice(0, -2)
    .concat('geolocation.geojson')
    .join('/');
  const response = await fetch(geoJsonUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch GeoJSON');
  }
  return await response.json();
};

type MapViews =
  | 'boundingBoxView'
  | 'detailedCoveredAreaView'
  | 'gtfsVisualizationView';

const CoveredAreaMap: React.FC<CoveredAreaMapProps> = ({
  boundingBox,
  latestDataset,
  feed,
  totalRoutes,
}) => {
  const t = useTranslations('feeds');
  const tCommon = useTranslations('common');
  const theme = useTheme();
  const { config } = useRemoteConfig();

  const latestGbfsVersion = useMemo((): GBFSVersionType | undefined => {
    if (feed?.data_type !== 'gbfs') return undefined;
    return getLatestGbfsVersion(feed as GBFSFeedType);
  }, [feed]);

  const hasNoRoutes = totalRoutes == undefined || totalRoutes === 0;

  // Compute the URL to fetch GeoJSON from, or null if nothing to fetch
  const geoJsonUrl = useMemo(() => {
    if (feed?.data_type === 'gbfs') {
      const reportUrl =
        latestGbfsVersion?.latest_validation_report?.report_summary_url;
      if (!config.enableDetailedCoveredArea || reportUrl == undefined)
        return null;
      return reportUrl;
    }
    if (
      feed?.data_type === 'gtfs' &&
      latestDataset?.hosted_url != null &&
      boundingBox != null &&
      config.enableDetailedCoveredArea
    ) {
      return latestDataset.hosted_url;
    }
    return null;
  }, [
    feed,
    latestGbfsVersion,
    latestDataset,
    boundingBox,
    config.enableDetailedCoveredArea,
  ]);

  const {
    data: geoJsonData,
    error: geoJsonError,
    isLoading: geoJsonLoading,
  } = useSWR(geoJsonUrl, fetchGeoJson, { revalidateOnFocus: false });

  // For GBFS, the fetched data may still lack a computable bounding box
  const gbfsGeoJsonBoundingBox =
    feed?.data_type === 'gbfs' && geoJsonData != null
      ? (computeBoundingBox(geoJsonData) ?? [])
      : [];
  const geoJsonFailed =
    !!geoJsonError ||
    (feed?.data_type === 'gbfs' &&
      geoJsonData != null &&
      gbfsGeoJsonBoundingBox.length === 0);

  // Derive the default view from current props and loaded data
  const computedView = useMemo((): MapViews => {
    if (feed?.data_type === 'gbfs') {
      return config.enableDetailedCoveredArea
        ? 'detailedCoveredAreaView'
        : 'boundingBoxView';
    }
    if (feed?.data_type === 'gtfs' && !hasNoRoutes && boundingBox != null) {
      return 'gtfsVisualizationView';
    }
    if (
      config.enableDetailedCoveredArea &&
      geoJsonData != null &&
      boundingBox != null
    ) {
      return 'detailedCoveredAreaView';
    }
    return 'boundingBoxView';
  }, [
    feed?.data_type,
    hasNoRoutes,
    boundingBox,
    geoJsonData,
    config.enableDetailedCoveredArea,
  ]);

  // Track an explicit user view selection per feed so it resets on navigation
  const [userViewState, setUserViewState] = useState<{
    feedId: string;
    view: MapViews;
  } | null>(null);
  const view =
    userViewState?.feedId === feed?.id ? userViewState?.view : computedView;

  const handleViewChange = (
    _: React.MouseEvent<HTMLElement>,
    newView: MapViews | null,
  ): void => {
    if (newView !== null)
      setUserViewState({ feedId: feed?.id ?? '', view: newView });
  };

  const handleOpenDetailedMapClick = (): void => {
    sendGAEvent('event', 'gtfs_visualization_open_detailed_map', {
      event_category: 'engagement',
      event_label: 'Open Detailed Map',
    });
  };

  const getGbfsLatestVersionVisualizationUrl = (): string | undefined => {
    const latestAutodiscoveryUrl = latestGbfsVersion?.endpoints?.find(
      (endpoint) => endpoint.name === 'gbfs',
    )?.url;
    if (latestAutodiscoveryUrl != undefined) {
      return `https://gbfs-validator.mobilitydata.org/visualization?url=${latestAutodiscoveryUrl}`;
    }
    return undefined;
  };

  const renderMap = (): React.ReactElement => {
    const displayBoundingBoxMap =
      view === 'boundingBoxView' &&
      (feed?.data_type === 'gtfs' ||
        (feed?.data_type === 'gbfs' && boundingBox != null));

    const displayGtfsVisualizationView =
      view === 'gtfsVisualizationView' && feed?.data_type === 'gtfs';

    if (displayBoundingBoxMap && boundingBox != undefined) {
      return <Map key={`bbox-${feed?.id}`} polygon={boundingBox} />;
    }

    if (
      displayGtfsVisualizationView &&
      boundingBox != undefined &&
      feed.data_type === 'gtfs'
    ) {
      const gtfsFeed = feed as GTFSFeedType;
      return (
        <>
          <Fab
            size='small'
            sx={{ position: 'absolute', top: 16, right: 16 }}
            component={Link}
            href={`/feeds/${feed.data_type}/${feed.id}/map`}
            aria-label={t('openDetailedMap')}
          >
            <ZoomOutMapIcon></ZoomOutMapIcon>
          </Fab>
          <GtfsVisualizationMap
            polygon={boundingBox}
            latestDataset={latestDataset}
            visualizationId={
              gtfsFeed?.visualization_dataset_id ?? latestDataset?.id ?? ''
            }
            dataDisplayLimit={config.visualizationMapPreviewDataLimit}
            preview={true}
            filteredRoutes={[]} // this is necessary to re-renders
            filteredRouteTypeIds={[]}
          />
        </>
      );
    }
    if (config.enableDetailedCoveredArea && geoJsonData != null) {
      const feedBoundingBox: LngLatTuple[] =
        feed?.data_type === 'gtfs'
          ? (boundingBox ?? [])
          : gbfsGeoJsonBoundingBox;
      if (feed?.data_type === 'gbfs' && gbfsGeoJsonBoundingBox.length === 0) {
        return <></>;
      }
      return (
        <MapGeoJSON
          key={`geojson-${feed?.id}`}
          geoJSONData={geoJsonData}
          polygon={feedBoundingBox}
          displayMapDetails={feed?.data_type === 'gtfs'}
        />
      );
    }
    return <></>;
  };

  const latestAutodiscoveryUrl = getGbfsLatestVersionVisualizationUrl();
  const enableGtfsVisualizationView = useMemo(() => {
    return (
      feed?.data_type === 'gtfs' && !hasNoRoutes && boundingBox != undefined
    );
  }, [feed?.data_type, hasNoRoutes, boundingBox]);

  return (
    <Box
      sx={{
        position: 'sticky',
        top: '74px',
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        minHeight: '50vh',
        p: 2,
        backgroundColor: theme.vars.palette.background.default,
        borderRadius: '5px',
        border: 'none',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography
          variant='subtitle1'
          sx={{ color: 'text.secondary', mt: 0.5 }}
        >
          {t('coveredAreaTitle') + ' - ' + t(view ?? '')}
        </Typography>
        {feed?.data_type === 'gbfs' && (
          <Box sx={{ textAlign: 'right' }}>
            {latestAutodiscoveryUrl != undefined && (
              <Button
                href={latestAutodiscoveryUrl}
                target='_blank'
                rel='noreferrer'
                endIcon={<OpenInNew />}
              >
                {t('viewRealtimeVisualization')}
              </Button>
            )}
            {(geoJsonData as GeoJSONDataGBFS)?.extracted_at != undefined && (
              <Typography
                variant='caption'
                color='text.secondary'
                sx={{ display: 'block', px: 1 }}
              >
                {tCommon('updated')}:{' '}
                {displayFormattedDate(
                  (geoJsonData as GeoJSONDataGBFS).extracted_at,
                )}
              </Typography>
            )}
          </Box>
        )}
        {feed?.data_type === 'gtfs' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            {view === 'gtfsVisualizationView' && (
              <Button
                variant='text'
                disableElevation
                component={Link}
                href={`/feeds/${feed.data_type}/${feed.id}/map`}
                onClick={handleOpenDetailedMapClick}
                endIcon={<OpenInNewIcon></OpenInNewIcon>}
              >
                {t('openDetailedMap')}
              </Button>
            )}
            <ToggleButtonGroup
              value={view}
              color='primary'
              exclusive
              aria-label='map view selection'
              onChange={handleViewChange}
              size='small'
            >
              <Tooltip title={t('gtfsVisualizationTooltip')}>
                <ToggleButton
                  value='gtfsVisualizationView'
                  disabled={!enableGtfsVisualizationView}
                  aria-label={t('gtfsVisualizationViewLabel')}
                >
                  <ModeOfTravelIcon />
                </ToggleButton>
              </Tooltip>
              {config.enableDetailedCoveredArea && (
                <Tooltip title={t('detailedCoveredAreaViewTooltip')}>
                  <ToggleButton
                    value='detailedCoveredAreaView'
                    disabled={
                      geoJsonLoading ||
                      geoJsonFailed ||
                      geoJsonUrl == null ||
                      boundingBox === undefined
                    }
                    aria-label='Detailed Covered Area View'
                  >
                    <TravelExploreIcon />
                  </ToggleButton>
                </Tooltip>
              )}
              <Tooltip title={t('boundingBoxViewTooltip')}>
                <ToggleButton
                  value='boundingBoxView'
                  aria-label='Bounding Box View'
                >
                  <MapIcon />
                </ToggleButton>
              </Tooltip>
            </ToggleButtonGroup>
          </Box>
        )}
      </Box>
      {(feed?.data_type === 'gtfs' || feed?.data_type === 'gbfs') &&
        boundingBox === undefined &&
        view === 'boundingBoxView' && (
          <WarningContentBox>
            {t('unableToGenerateBoundingBox')}
          </WarningContentBox>
        )}

      {config.enableDetailedCoveredArea &&
        feed?.data_type === 'gbfs' &&
        (geoJsonFailed || geoJsonUrl == null) && (
          <WarningContentBox>{t('unableToGetGbfsMap')}</WarningContentBox>
        )}

      {(boundingBox != undefined || !geoJsonFailed) && (
        <Box key={view} sx={mapBoxPositionStyle}>
          {geoJsonLoading ? (
            <Skeleton
              variant='rectangular'
              width='100%'
              height='100%'
              animation='wave'
            />
          ) : (
            <>{renderMap()}</>
          )}
        </Box>
      )}
    </Box>
  );
};

export default CoveredAreaMap;
