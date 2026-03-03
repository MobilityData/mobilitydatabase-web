'use client';
import * as React from 'react';
import { useCallback, useRef, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Container,
  CssBaseline,
  Grid,
  InputAdornment,
  LinearProgress,
  Pagination,
  Skeleton,
  TableContainer,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import SearchTable from '../../../screens/Feeds/SearchTable';
import { useTranslations } from 'next-intl';
import {
  chipHolderStyles,
  searchBarStyles,
  stickyHeaderStyles,
} from '../../../screens/Feeds/Feeds.styles';
import { ColoredContainer } from '../../../styles/PageLayout.style';
import AdvancedSearchTable from '../../../screens/Feeds/AdvancedSearchTable';
import ViewHeadlineIcon from '@mui/icons-material/ViewHeadline';
import GridViewIcon from '@mui/icons-material/GridView';
import { SearchFilters } from '../../../screens/Feeds/SearchFilters';
import {
  useFeedsSearch,
  deriveSearchParams,
  deriveFilterFlags,
  buildSearchUrl,
} from '../lib/useFeedsSearch';

export default function FeedsScreen(): React.ReactElement {
  const theme = useTheme();
  const t = useTranslations('feeds');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Derive all state from URL - single source of truth
  const derivedPageState = deriveSearchParams(searchParams);
  const {
    searchQuery: activeSearch,
    page: activePagination,
    feedTypes: selectedFeedTypes,
    isOfficial: isOfficialFeedSearch,
    features: selectedFeatures,
    gbfsVersions: selectedGbfsVersions,
    licenses: selectedLicenses,
    hasTransitFeedsRedirect: hasTransitFeedsRedirectParam,
  } = derivedPageState;

  const {
    isOfficialTagFilterEnabled,
    areFeatureFiltersEnabled,
    areGBFSFiltersEnabled,
  } = deriveFilterFlags(selectedFeedTypes);

  // SWR-powered data fetching - keyed off URL params
  const { feedsData, isLoading, isValidating, isError, searchLimit } =
    useFeedsSearch(searchParams);

  // Local state only for the text input (not committed to URL until submit)
  const [searchInputValue, setSearchInputValue] = useState(activeSearch);
  const [searchView, setSearchView] = useState<'simple' | 'advanced'>(
    'advanced',
  );
  const [isSticky, setIsSticky] = useState(false);

  // Keep the text input in sync when URL changes (e.g. browser back)
  useEffect(() => {
    setSearchInputValue(activeSearch);
  }, [activeSearch]);

  // --- Navigation helper: push new URL with updated filters ---
  const utmSource = searchParams.get('utm_source');
  const navigate = useCallback(
    (overrides: Parameters<typeof buildSearchUrl>[1]) => {
      const url = buildSearchUrl(pathname, {
        searchQuery: activeSearch,
        page: activePagination,
        feedTypes: selectedFeedTypes,
        isOfficial: isOfficialFeedSearch,
        features: selectedFeatures,
        gbfsVersions: selectedGbfsVersions,
        licenses: selectedLicenses,
        utmSource,
        ...overrides,
      });
      router.push(url);
    },
    [
      pathname,
      activeSearch,
      activePagination,
      selectedFeedTypes,
      isOfficialFeedSearch,
      selectedFeatures,
      selectedGbfsVersions,
      selectedLicenses,
      utmSource,
      router,
    ],
  );

  const getSearchResultNumbers = (): string => {
    if (feedsData?.total !== undefined && feedsData.total > 0) {
      const paginationOffset = (activePagination - 1) * searchLimit;
      const offset = paginationOffset;
      const limit = offset + searchLimit;
      const startResult = 1 + offset;
      const endResult = limit > feedsData.total ? feedsData.total : limit;
      const totalResults = feedsData.total ?? '';
      return t('resultsFor', { startResult, endResult, totalResults });
    }
    return '';
  };

  function clearAllFilters(): void {
    navigate({
      page: 1,
      feedTypes: { gtfs: false, gtfs_rt: false, gbfs: false },
      features: [],
      gbfsVersions: [],
      licenses: [],
      isOfficial: false,
    });
  }

  // --- Sticky header observer ---
  const containerRef = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSticky(!entry.isIntersecting);
      },
      { threshold: 1.0 },
    );

    if (containerRef.current !== null) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleViewChange = (
    _event: React.MouseEvent<HTMLElement>,
    newSearchView: 'simple' | 'advanced' | null,
  ): void => {
    if (newSearchView != null) {
      setSearchView(newSearchView);
    }
  };

  return (
    <Container
      component='main'
      maxWidth={false}
      sx={{
        overflowX: 'initial',
        position: 'relative',
      }}
    >
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
        }}
        mx={{ xs: 0, md: 'auto' }}
      >
        <Container
          disableGutters
          maxWidth={'xl'}
          sx={{ boxSizing: 'content-box' }}
        >
          <Typography variant='h1' ref={containerRef}>
            {tCommon('feeds')}
          </Typography>
          {activeSearch !== '' && (
            <Typography variant='subtitle1'>
              {t('searchFor')}: <b>{activeSearch}</b>
            </Typography>
          )}
        </Container>
        <Box
          sx={stickyHeaderStyles({
            theme,
            isSticky,
            headerBannerVisible: hasTransitFeedsRedirectParam,
          })}
        >
          <Container
            maxWidth={'xl'}
            component='form'
            onSubmit={(event) => {
              event.preventDefault();
              navigate({
                searchQuery: searchInputValue.trim(),
                page: 1,
              });
            }}
            sx={searchBarStyles}
          >
            <TextField
              sx={{
                width: 'calc(100% - 85px)',
              }}
              value={searchInputValue}
              placeholder={t('searchPlaceholder')}
              onChange={(e) => {
                setSearchInputValue(e.target.value);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment
                    style={{
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      navigate({
                        searchQuery: searchInputValue.trim(),
                        page: 1,
                      });
                    }}
                    position='start'
                  >
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant='contained'
              type='submit'
              sx={{ m: 1, height: '55px', mr: 0 }}
            >
              {tCommon('search')}
            </Button>
          </Container>
        </Box>
        <ColoredContainer maxWidth={'xl'} sx={{ pt: 2 }}>
          {isValidating && !isLoading && (
            <LinearProgress
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                zIndex: 2,
              }}
            />
          )}
          <Grid
            container
            spacing={1}
            sx={{
              fontSize: '18px',
              mt: 0,
              flexWrap: { xs: 'wrap', md: 'nowrap' },
            }}
          >
            <Grid
              size={{ xs: 12, md: 2 }}
              sx={{
                minWidth: '275px',
                pr: 2,
              }}
            >
              <SearchFilters
                selectedFeedTypes={selectedFeedTypes}
                isOfficialFeedSearch={isOfficialFeedSearch}
                selectedFeatures={selectedFeatures}
                selectedGbfsVersions={selectedGbfsVersions}
                selectedLicenses={selectedLicenses}
                setSelectedFeedTypes={(feedTypes) => {
                  navigate({ feedTypes: { ...feedTypes }, page: 1 });
                }}
                setIsOfficialFeedSearch={(isOfficial) => {
                  navigate({ isOfficial, page: 1 });
                }}
                setSelectedFeatures={(features) => {
                  navigate({ features, page: 1 });
                }}
                setSelectedGbfsVerions={(versions) => {
                  navigate({ gbfsVersions: versions, page: 1 });
                }}
                setSelectedLicenses={(licenses) => {
                  navigate({ licenses, page: 1 });
                }}
                isOfficialTagFilterEnabled={isOfficialTagFilterEnabled}
                areFeatureFiltersEnabled={areFeatureFiltersEnabled}
                areGBFSFiltersEnabled={areGBFSFiltersEnabled}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 10 }}>
              <Box sx={chipHolderStyles}>
                {selectedFeedTypes.gtfs && (
                  <Chip
                    color='primary'
                    variant='outlined'
                    size='small'
                    label={tCommon('gtfsSchedule')}
                    onDelete={() => {
                      navigate({
                        feedTypes: { ...selectedFeedTypes, gtfs: false },
                        page: 1,
                      });
                    }}
                  />
                )}
                {selectedFeedTypes.gtfs_rt && (
                  <Chip
                    color='primary'
                    variant='outlined'
                    size='small'
                    label={tCommon('gtfsRealtime')}
                    onDelete={() => {
                      navigate({
                        feedTypes: { ...selectedFeedTypes, gtfs_rt: false },
                        page: 1,
                      });
                    }}
                  />
                )}
                {selectedFeedTypes.gbfs && (
                  <Chip
                    color='primary'
                    variant='outlined'
                    size='small'
                    label={tCommon('gbfs')}
                    onDelete={() => {
                      navigate({
                        feedTypes: { ...selectedFeedTypes, gbfs: false },
                        page: 1,
                      });
                    }}
                  />
                )}
                {isOfficialFeedSearch && isOfficialTagFilterEnabled && (
                  <Chip
                    color='primary'
                    variant='outlined'
                    size='small'
                    label={'Official Feeds'}
                    onDelete={() => {
                      navigate({ isOfficial: false, page: 1 });
                    }}
                  />
                )}
                {areFeatureFiltersEnabled &&
                  selectedFeatures.map((feature) => (
                    <Chip
                      color='primary'
                      variant='outlined'
                      size='small'
                      label={feature}
                      key={feature}
                      onDelete={() => {
                        navigate({
                          features: selectedFeatures.filter(
                            (sf) => sf !== feature,
                          ),
                        });
                      }}
                    />
                  ))}

                {areGBFSFiltersEnabled &&
                  selectedGbfsVersions.map((gbfsVersion) => (
                    <Chip
                      color='primary'
                      variant='outlined'
                      size='small'
                      label={gbfsVersion}
                      key={gbfsVersion}
                      onDelete={() => {
                        navigate({
                          gbfsVersions: selectedGbfsVersions.filter(
                            (sv) => sv !== gbfsVersion,
                          ),
                        });
                      }}
                    />
                  ))}

                {selectedLicenses.map((license) => (
                  <Chip
                    color='primary'
                    variant='outlined'
                    size='small'
                    label={license}
                    key={license}
                    onDelete={() => {
                      navigate({
                        licenses: selectedLicenses.filter(
                          (sl) => sl !== license,
                        ),
                      });
                    }}
                  />
                ))}

                {(selectedFeatures.length > 0 ||
                  selectedGbfsVersions.length > 0 ||
                  selectedLicenses.length > 0 ||
                  isOfficialFeedSearch ||
                  selectedFeedTypes.gtfs_rt ||
                  selectedFeedTypes.gtfs ||
                  selectedFeedTypes.gbfs) && (
                  <Button
                    variant={'text'}
                    onClick={clearAllFilters}
                    size={'small'}
                    color={'primary'}
                  >
                    Clear All
                  </Button>
                )}
              </Box>
              {isLoading && (
                <Grid size={12}>
                  <Skeleton
                    animation='wave'
                    variant='text'
                    sx={{ fontSize: '1rem', width: '200px' }}
                  />
                  <Skeleton
                    animation='wave'
                    variant='text'
                    sx={{ fontSize: '2rem', width: '100%' }}
                  />
                  <Skeleton
                    animation='wave'
                    variant='rectangular'
                    width={'100%'}
                    height={'1118px'}
                  />
                  <Skeleton
                    animation='wave'
                    variant='text'
                    sx={{ fontSize: '2rem', width: '320px' }}
                  />
                </Grid>
              )}

              {isError && (
                <Grid size={12}>
                  <h3>{tCommon('errors.generic')}</h3>
                  <Typography>
                    {t.rich('errorAndContact', {
                      contactLink: (chunks) => (
                        <Button
                          variant='text'
                          className='inline'
                          href={'mailto:api@mobilitydata.org'}
                        >
                          {chunks}
                        </Button>
                      ),
                    })}
                  </Typography>
                </Grid>
              )}

              {feedsData !== undefined && !isLoading && (
                <>
                  {feedsData?.results?.length === 0 && (
                    <Grid size={12}>
                      <h3>{t('noResults', { activeSearch })}</h3>
                      <Typography>{t('searchSuggestions')}</Typography>
                      <ul>
                        <li>
                          <Typography>{t('searchTips.twoDigit')}</Typography>
                        </li>
                        <li>
                          <Typography>{t('searchTips.fullName')}</Typography>
                        </li>
                        <li>
                          <Typography>
                            Try adjusting your filters, or removing strict
                            criteria
                          </Typography>
                        </li>
                        <li>
                          <Typography>
                            {t('searchTips.checkSpelling')}
                          </Typography>
                        </li>
                      </ul>
                    </Grid>
                  )}
                  {feedsData?.results !== undefined &&
                    feedsData?.results !== null &&
                    feedsData?.results?.length > 0 && (
                      <TableContainer sx={{ overflowX: 'initial' }}>
                        <Grid
                          size={12}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'self-end',
                          }}
                        >
                          <Typography
                            variant='subtitle2'
                            sx={{ fontWeight: 'bold' }}
                            gutterBottom
                          >
                            {getSearchResultNumbers()}
                          </Typography>
                          <ToggleButtonGroup
                            color='primary'
                            value={searchView}
                            exclusive
                            onChange={handleViewChange}
                            aria-label='Platform'
                          >
                            <ToggleButton
                              value='simple'
                              aria-label='Simple Search View'
                            >
                              <ViewHeadlineIcon></ViewHeadlineIcon>
                            </ToggleButton>
                            <ToggleButton
                              value='advanced'
                              aria-label='Advanced Search View'
                            >
                              <GridViewIcon></GridViewIcon>
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Grid>
                        {searchView === 'simple' ? (
                          <SearchTable feedsData={feedsData} />
                        ) : (
                          <AdvancedSearchTable
                            feedsData={feedsData}
                            selectedFeatures={selectedFeatures}
                            selectedGbfsVersions={selectedGbfsVersions}
                            isLoadingFeeds={isLoading || isValidating}
                          />
                        )}

                        <Pagination
                          sx={{
                            mt: 2,
                            button: {
                              backgroundColor: theme.palette.background.default,
                              color: theme.palette.primary.main,
                              '&.Mui-selected': {
                                backgroundColor: theme.palette.primary.main,
                                color: theme.palette.background.default,
                              },
                            },
                          }}
                          color='primary'
                          page={activePagination}
                          shape='rounded'
                          count={
                            feedsData.total !== undefined
                              ? Math.ceil(feedsData.total / searchLimit)
                              : 1
                          }
                          onChange={(_event, value) => {
                            navigate({ page: value });
                          }}
                        />
                      </TableContainer>
                    )}
                </>
              )}
            </Grid>
          </Grid>
        </ColoredContainer>
      </Box>
    </Container>
  );
}
