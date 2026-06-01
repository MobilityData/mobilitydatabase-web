import { CheckCircle, ReportOutlined } from '@mui/icons-material';
import {
  Box,
  Container,
  Typography,
  Chip,
  Tooltip,
  useTheme,
  Skeleton,
  LinearProgress,
} from '@mui/material';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import GbfsFeedSearchInput from './GbfsFeedSearchInput';
import { gbfsValidatorHeroBg } from './ValidationReport.styles';
import ValidationReport from './ValidationReport';
import { useSelector, useDispatch } from 'react-redux';
import { validateStart } from '../../store/gbfs-validator-reducer';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  selectGbfsValidationError,
  selectGbfsValidationLoading,
  selectGbfsValidationResult,
} from '../../store/gbfs-validator-selectors';
import { useGbfsAuth } from '../../context/GbfsAuthProvider';
import { ValidationErrorAlert } from './ValidationErrorAlert';
import { groupErrorsByFile } from './errorGrouping';
import { useGbfsFeedData } from './hooks/useGbfsFeedData';
import { ErrorDetailsDialog } from './components/ErrorDetailsDialog';
import type {
  MapErrorDetails,
  GbfsMapHandle,
} from '../../components/GbfsMap/GbfsVisualizationMap';
import { getErrorLocation } from './mapErrorOverlay';
import type { FileError } from './ValidationReport';

const GbfsVisualizationMap = dynamic(
  async () =>
    await import('../../components/GbfsMap/GbfsVisualizationMap').then(
      (mod) => mod.GbfsVisualizationMap,
    ),
  {
    ssr: false,
    loading: () => <Skeleton variant='rectangular' height={500} />,
  },
);

export default function ValidationState(): ReactElement {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [longLoadingState, setLongLoadingState] = useState(false);
  const { auth } = useGbfsAuth();
  const loadingState = useSelector(selectGbfsValidationLoading);
  const validationResult = useSelector(selectGbfsValidationResult);
  const validationError = useSelector(selectGbfsValidationError);
  const dispatch = useDispatch();
  const feedUrl = searchParams.get('AutoDiscoveryUrl');
  const {
    feedData,
    loading: mapLoading,
    error: mapError,
    refresh: refreshMapData,
  } = useGbfsFeedData(feedUrl);

  // Error details dialog triggered from map popup
  const [mapErrorDialogOpen, setMapErrorDialogOpen] = useState(false);
  const [mapErrorDetails, setMapErrorDetails] =
    useState<MapErrorDetails | null>(null);

  // Refs for "See on Map" feature
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapHandleRef = useRef<GbfsMapHandle>(null);

  const handleViewError = useCallback((details: MapErrorDetails) => {
    setMapErrorDetails(details);
    setMapErrorDialogOpen(true);
  }, []);

  const handleSeeOnMap = useCallback(
    (fileName: string, fileUrl: string | undefined, error: FileError) => {
      if (feedData == null) return;
      const loc = getErrorLocation(
        error.instancePath ?? '',
        fileName,
        feedData,
      );
      if (loc == null) return;

      // Scroll map into view
      mapContainerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      // Fly to error location and open popup after scroll settles
      setTimeout(() => {
        mapHandleRef.current?.flyToError(loc.lat, loc.lon, {
          keyword: error.keyword ?? '',
          message: error.message ?? '',
          instancePath: error.instancePath ?? '',
          fileName,
          fileUrl,
        });
      }, 400);
    },
    [feedData],
  );

  const {
    gbfsVersion,
    numberOfErrors,
    numberOfSystemErrors,
    uniqueErrorCount,
    isValidFeed,
    validatorVersion,
  } = useMemo(() => {
    const files = validationResult?.summary?.files ?? [];
    const gbfsVersion = files.find((f) => f.version != null)?.version ?? 'N/A';
    const numberOfErrors = files.reduce(
      (acc, f) => acc + (f.errors?.length ?? 0),
      0,
    );
    const numberOfSystemErrors = files.reduce(
      (acc, f) => acc + (f.systemErrors?.length ?? 0),
      0,
    );
    const totalErrors = numberOfErrors + numberOfSystemErrors;
    const uniqueErrorCount = groupErrorsByFile(files).reduce(
      (acc, f) => acc + f.groups.length,
      0,
    );
    const isValidFeed = totalErrors === 0;
    const validatorVersion =
      validationResult?.summary?.validatorVersion ?? 'N/A';
    return {
      gbfsVersion,
      numberOfErrors,
      numberOfSystemErrors,
      uniqueErrorCount,
      isValidFeed,
      validatorVersion,
    };
  }, [
    validationResult?.summary?.files,
    validationResult?.summary?.validatorVersion,
  ]);

  const triggerDataFetch = (): void => {
    if (feedUrl !== null && feedUrl !== '') {
      dispatch(validateStart({ feedUrl, auth }));
    } else {
      router.push('/gbfs-validator');
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (loadingState) {
      timer = setTimeout(() => {
        setLongLoadingState(true);
      }, 5000);
    } else {
      setLongLoadingState(false);
    }

    return () => {
      // cleanup timer on unmount or when loadingState changes
      if (timer != null) {
        clearTimeout(timer);
      }
    };
  }, [loadingState]);

  useEffect(() => {
    triggerDataFetch();
  }, [dispatch, feedUrl, auth]);

  return (
    <>
      <Box
        sx={{
          ...gbfsValidatorHeroBg,
          p: 1,
          mt: '-32px',
        }}
      >
        <Container maxWidth='lg' sx={{ my: 2 }}>
          <GbfsFeedSearchInput
            initialFeedUrl={feedUrl ?? ''}
            triggerDataFetch={triggerDataFetch}
          ></GbfsFeedSearchInput>
        </Container>
      </Box>
      {longLoadingState && (
        <LinearProgress sx={{ position: 'absolute', width: '100%' }} />
      )}

      <Container maxWidth='lg' sx={{ mb: 4, mt: 2 }}>
        <Box sx={{ mt: 4 }}>
          <Typography variant='h6' sx={{ opacity: 0.8 }}>
            GBFS Feed Validation
          </Typography>
          <Typography
            variant='h4'
            sx={{
              fontWeight: 700,
              mb: 3,
              color: theme.vars.palette.primary.main,
              overflowWrap: 'break-word',
            }}
          >
            {feedUrl}
          </Typography>
        </Box>
        {validationError != null && validationError !== '' && (
          <ValidationErrorAlert
            validationError={validationError}
            triggerDataFetch={triggerDataFetch}
          ></ValidationErrorAlert>
        )}
        {(validationError == null || validationError === '') && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              mb: 3,
              flexWrap: 'wrap',
            }}
          >
            {loadingState ? (
              [120, 140, 160, 180].map((w, i) => (
                <Skeleton key={i} variant='rounded' width={w} height={32} />
              ))
            ) : (
              <>
                <Tooltip title='GBFS Version of the feed' placement='top'>
                  <Chip label={`Version ${gbfsVersion}`} color='primary' />
                </Tooltip>
                {isValidFeed && (
                  <Chip
                    icon={<CheckCircle />}
                    label='Valid Feed'
                    color='success'
                  />
                )}
                {!isValidFeed && (
                  <>
                    <Tooltip
                      title='This feed contains errors and does not fully comply with the GBFS specification.'
                      placement='top'
                    >
                      <Chip
                        icon={<ReportOutlined />}
                        label='Invalid Feed'
                        color='error'
                      />
                    </Tooltip>
                    <Chip
                      label={`${numberOfErrors} Total Errors`}
                      color='error'
                      variant='outlined'
                    />

                    <Chip
                      label={`${uniqueErrorCount} Unique Errors`}
                      color='error'
                      variant='outlined'
                    />
                    {numberOfSystemErrors > 0 && (
                      <Chip
                        label={`${numberOfSystemErrors} Total System Errors`}
                        color='warning'
                        variant='outlined'
                      />
                    )}
                  </>
                )}
                <Tooltip
                  title='Version of the GBFS Validator used'
                  placement='top'
                >
                  <Chip
                    label={`Validator v${validatorVersion}`}
                    variant='outlined'
                  />
                </Tooltip>
              </>
            )}
          </Box>
        )}

        {/* GBFS Map Visualization */}
        <Box ref={mapContainerRef} sx={{ mb: 3 }}>
          <GbfsVisualizationMap
            ref={mapHandleRef}
            feedData={feedData}
            loading={mapLoading}
            error={mapError}
            validationResult={validationResult}
            onRefresh={refreshMapData}
            onViewError={handleViewError}
            feedUrl={feedUrl}
          />
        </Box>

        <ValidationReport
          validationResult={validationResult}
          loading={loadingState}
          feedData={feedData}
          onSeeOnMap={handleSeeOnMap}
        ></ValidationReport>
      </Container>

      {/* Error details dialog from map popup "View Error" */}
      <ErrorDetailsDialog
        open={mapErrorDialogOpen}
        onClose={() => {
          setMapErrorDialogOpen(false);
        }}
        fileName={mapErrorDetails?.fileName ?? ''}
        fileUrl={mapErrorDetails?.fileUrl}
        error={
          mapErrorDetails != null
            ? {
                keyword: mapErrorDetails.error.keyword ?? '',
                message: mapErrorDetails.error.message ?? '',
                instancePath: mapErrorDetails.error.instancePath ?? '',
                schemaPath: '',
              }
            : null
        }
      />
    </>
  );
}
