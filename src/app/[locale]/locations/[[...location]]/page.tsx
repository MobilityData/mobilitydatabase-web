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
  buildLocationHref,
  buildPlaceName,
  FEEDS_SECTION_ID,
  getBreadcrumbSlugs,
  getChildLevel,
  getPageCount,
  getTotalFeedCount,
  type LocationQuery,
  parseLocationSegments,
  parsePageParam,
} from '../lib/location-directory';
import {
  fetchLocationDirectory,
  fetchLocationDirectoryFeeds,
} from '../lib/location-directory-data';

const SITE_URL = 'https://mobilitydatabase.org';

interface PageProps {
  params: Promise<{ locale: string; location?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ParsedRequest {
  query: LocationQuery;
  page: number;
}

async function parseRequest({
  params,
  searchParams,
}: PageProps): Promise<{ locale: string } & (ParsedRequest | { query: null })> {
  const [{ locale, location }, { page: rawPage }] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = parseLocationSegments(location);
  const page = parsePageParam(rawPage);
  if (query === null || page === null) return { locale, query: null };
  return { locale, query, page };
}

function fetchDirectory(
  query: LocationQuery,
): ReturnType<typeof fetchLocationDirectory> {
  return fetchLocationDirectory(
    query.continent,
    query.country,
    query.subdivision,
    query.municipality,
  );
}

function fetchFeedsPage(
  query: LocationQuery,
  page: number,
): ReturnType<typeof fetchLocationDirectoryFeeds> {
  return fetchLocationDirectoryFeeds(
    page,
    query.continent,
    query.country,
    query.subdivision,
    query.municipality,
  );
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const request = await parseRequest(props);
  if (request.query === null) return {};
  const { query, page } = request;
  // Same calls as the page: deduped by React cache() within the request.
  const [directory, feeds, t] = await Promise.all([
    fetchDirectory(query),
    fetchFeedsPage(query, page),
    getTranslations({ locale: request.locale, namespace: 'locations.meta' }),
  ]);
  if (
    directory === null ||
    feeds === null ||
    page > getPageCount(feeds.total ?? 0)
  ) {
    return {};
  }

  const place = buildPlaceName(directory.breadcrumb);
  const counts = directory.feed_counts;
  const isRoot = place === '';
  const title = isRoot
    ? t('rootTitle')
    : page > 1
      ? t('nodeTitlePaged', { place, page })
      : t('nodeTitle', { place });
  const description = isRoot
    ? t('rootDescription')
    : t('nodeDescription', {
        place,
        total: getTotalFeedCount(counts),
        gtfs: counts?.gtfs ?? 0,
        gtfs_rt: counts?.gtfs_rt ?? 0,
        gbfs: counts?.gbfs ?? 0,
      });
  const url = `${SITE_URL}${buildLocationHref(
    getBreadcrumbSlugs(directory.breadcrumb),
    page,
  )}`;

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
  if (request.query === null) notFound();
  const { locale, query, page } = request;
  setRequestLocale(locale);

  // Directory node and feed page are independent: fetch them in parallel.
  const [directory, feeds, t, tCommon] = await Promise.all([
    fetchDirectory(query),
    fetchFeedsPage(query, page),
    getTranslations('locations'),
    getTranslations('common'),
  ]);
  if (directory === null || feeds === null) notFound();

  const total = feeds.total ?? 0;
  const pageCount = getPageCount(total);
  if (page > pageCount) notFound();

  const breadcrumb = directory.breadcrumb ?? [];
  const slugs = getBreadcrumbSlugs(breadcrumb);
  const place = buildPlaceName(breadcrumb);
  const isRoot = breadcrumb.length === 0;
  const children = directory.children ?? [];
  const childLevel = getChildLevel(directory.level);

  const crumbs: Crumb[] = [
    { label: tCommon('feeds'), href: '/feeds' },
    { label: t('root'), href: isRoot ? undefined : buildLocationHref([]) },
    ...breadcrumb.map((node, index) => ({
      label: node.name ?? node.slug ?? '',
      href:
        index === breadcrumb.length - 1
          ? undefined
          : buildLocationHref(slugs.slice(0, index + 1)),
    })),
  ];
  // Without history to pop, back goes one level up the directory.
  const backFallbackHref = isRoot
    ? '/feeds'
    : buildLocationHref(slugs.slice(0, -1));

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
          {isRoot ? t('title') : breadcrumb[breadcrumb.length - 1]?.name}
        </Typography>
        <Typography
          variant='subtitle1'
          color='text.secondary'
          sx={{ mb: 3, maxWidth: 760 }}
        >
          {isRoot
            ? t('rootIntro')
            : t('nodeIntro', {
                total: getTotalFeedCount(directory.feed_counts),
                place,
              })}
        </Typography>

        <FeedCountSummary counts={directory.feed_counts} locale={locale} />

        {childLevel !== null && children.length > 0 ? (
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
              {t(`childrenHeading.${childLevel}`)}{' '}
              <Box component='span' sx={{ color: 'text.secondary' }}>
                ({children.length})
              </Box>
            </Typography>
            <LocationChildrenGrid
              nodes={children}
              parentSlugs={slugs}
              locale={locale}
            />
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
            slugs={slugs}
          />
        </Box>
      </SectionContainer>
    </Container>
  );
}
