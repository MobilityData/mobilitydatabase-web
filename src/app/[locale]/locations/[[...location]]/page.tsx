import { type ReactElement } from 'react';
import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Box, Container, Typography } from '@mui/material';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import BreadcrumbNavigation, {
  type Crumb,
} from '../../../components/BreadcrumbNavigation';
import SectionContainer from '../../../components/SectionContainer';
import FeedCountSummary from '../components/FeedCountSummary';
import LocationChildrenGrid from '../components/LocationChildrenGrid';
import LocationFeedsList from '../components/LocationFeedsList';
import {
  buildBreadcrumbSteps,
  buildLocationHref,
  buildPlaceName,
  FEEDS_SECTION_ID,
  getLocationName,
  getPageCount,
  getTotalFeedCount,
  parseLocationSegments,
  parsePageParam,
} from '../lib/location-directory';
import {
  fetchLocationPage,
  type LocationPageData,
} from '../lib/location-directory-data';

const SITE_URL = 'https://mobilitydatabase.org';

interface PageProps {
  params: Promise<{ locale: string; location?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ParsedRequest {
  locale: string;
  /** URL segments: the location's API path slugs, continent first. */
  segments: string[];
  page: number;
}

/** The request, or null when the URL or the page number is malformed. */
async function parseRequest({
  params,
  searchParams,
}: PageProps): Promise<ParsedRequest | null> {
  const [{ locale, location: segments }, { page: rawPage }] = await Promise.all(
    [params, searchParams],
  );
  const slugs = parseLocationSegments(segments);
  const page = parsePageParam(rawPage);
  if (slugs === null || page === null) return null;
  return { locale, segments: slugs, page };
}

/**
 * The page data, or null when the location does not exist or the page is
 * past the last one. Deduped by React cache() between generateMetadata and
 * the page.
 */
async function fetchPageData({
  segments,
  page,
}: ParsedRequest): Promise<LocationPageData | null> {
  const data = await fetchLocationPage(page, segments.join('/'));
  if (data === null || page > getPageCount(data.feeds.total ?? 0)) {
    return null;
  }
  return data;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const request = await parseRequest(props);
  if (request === null) return {};
  const [data, t] = await Promise.all([
    fetchPageData(request),
    getTranslations({ locale: request.locale, namespace: 'locations.meta' }),
  ]);
  if (data === null) return {};

  const { location } = data;
  const { page } = request;
  const place = buildPlaceName(location);
  const counts = location?.feed_counts;
  const title =
    location === null
      ? t('rootTitle')
      : page > 1
        ? t('nodeTitlePaged', { place, page })
        : t('nodeTitle', { place });
  const description =
    location === null
      ? t('rootDescription')
      : t('nodeDescription', {
          place,
          total: getTotalFeedCount(counts),
          gtfs: counts?.gtfs ?? 0,
          gtfs_rt: counts?.gtfs_rt ?? 0,
          gbfs: counts?.gbfs ?? 0,
        });
  // The URL is the location's API path.
  const url = `${SITE_URL}${buildLocationHref(request.segments, page)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Mobility Database',
      type: 'website',
    },
  };
}

export default async function LocationsPage(
  props: PageProps,
): Promise<ReactElement> {
  const request = await parseRequest(props);
  if (request === null) notFound();
  const { locale, page, segments } = request;
  setRequestLocale(locale);

  const [data, t, tCommon] = await Promise.all([
    fetchPageData(request),
    getTranslations('locations'),
    getTranslations('common'),
  ]);
  if (data === null) notFound();

  const { location, children, feeds } = data;
  const isRoot = location === null;
  const total = feeds.total ?? 0;
  const pageCount = getPageCount(total);
  const place = buildPlaceName(location);
  const steps = buildBreadcrumbSteps(location);

  const crumbs: Crumb[] = [
    { label: tCommon('feeds'), href: '/feeds' },
    { label: t('root'), href: isRoot ? undefined : buildLocationHref([]) },
    ...steps.map((step, index) => ({
      label: step.label,
      href:
        index === steps.length - 1
          ? undefined
          : buildLocationHref(step.segments),
    })),
  ];
  // Without history to pop, back goes one level up the directory.
  const backFallbackHref = isRoot
    ? '/feeds'
    : buildLocationHref(segments.slice(0, -1));
  const childrenHeading = isRoot
    ? t('childrenHeading.continents')
    : location.location_type === 'continent'
      ? t('childrenHeading.countries')
      : t('childrenHeading.places');

  return (
    <Container
      component='main'
      maxWidth='xl'
      sx={{ width: '100%', m: 'auto', px: 0 }}
    >
      <SectionContainer maxWidth='xl'>
        <BreadcrumbNavigation
          crumbs={crumbs}
          backFallbackHref={backFallbackHref}
        />
        <Typography variant='h1' sx={{ mt: 1 }}>
          {isRoot ? t('title') : getLocationName(location)}
        </Typography>
        <Typography
          variant='subtitle1'
          color='text.secondary'
          sx={{ mb: 3, maxWidth: 760 }}
        >
          {isRoot
            ? t('rootIntro')
            : t('nodeIntro', {
                total: getTotalFeedCount(location.feed_counts),
                place,
              })}
        </Typography>

        {/* No catalog-wide counts by data type at the root. */}
        {isRoot ? null : (
          <FeedCountSummary counts={location.feed_counts} locale={locale} />
        )}

        {children.length > 0 ? (
          <Box
            component='section'
            aria-labelledby='location-children-heading'
            sx={{ mt: { xs: 4, md: 5 } }}
          >
            <Typography
              id='location-children-heading'
              component='h2'
              variant='h5'
              sx={{ fontWeight: 700, mb: 2 }}
            >
              {childrenHeading}{' '}
              <Box component='span' sx={{ color: 'text.secondary' }}>
                ({children.length})
              </Box>
            </Typography>
            <LocationChildrenGrid locations={children} locale={locale} />
          </Box>
        ) : null}

        <Box
          component='section'
          id={FEEDS_SECTION_ID}
          aria-labelledby='location-feeds-heading'
          sx={{ mt: { xs: 4, md: 5 }, scrollMarginTop: '88px' }}
        >
          <Typography
            id='location-feeds-heading'
            component='h2'
            variant='h5'
            sx={{ fontWeight: 700, mb: 2 }}
          >
            {isRoot ? t('allFeedsHeading') : t('feedsHeading', { place })}
          </Typography>
          <LocationFeedsList
            feeds={feeds.results ?? []}
            total={total}
            page={page}
            pageCount={pageCount}
            segments={segments}
          />
        </Box>
      </SectionContainer>
    </Container>
  );
}
