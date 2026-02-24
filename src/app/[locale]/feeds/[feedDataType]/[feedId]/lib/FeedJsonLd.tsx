import { type ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import type {
  AllFeedType,
  GTFSFeedType,
  GTFSRTFeedType,
} from '../../../../../services/feeds/utils';
import {
  formatProvidersSorted,
  generateDescriptionMetaTag,
} from '../../../../../screens/Feed/Feed.functions';
import generateFeedStructuredData from './generate-feed-metadata';

interface FeedJsonLdProps {
  feed: AllFeedType;
  relatedFeeds?: AllFeedType[];
  relatedGtfsRtFeeds?: GTFSRTFeedType[];
}

/**
 * Server component that renders JSON-LD structured data for SEO.
 * Injects a <script type="application/ld+json"> tag directly into the page,
 * following the Next.js App Router recommendation:
 * https://nextjs.org/docs/app/guides/json-ld
 */
export default async function FeedJsonLd({
  feed,
  relatedFeeds,
  relatedGtfsRtFeeds,
}: FeedJsonLdProps): Promise<ReactElement | null> {
  if (feed == null) return null;

  const t = await getTranslations();

  const sortedProviders = formatProvidersSorted(feed?.provider ?? '');
  const feedDataType = feed.data_type;
  const description = generateDescriptionMetaTag(
    t,
    sortedProviders,
    feedDataType as 'gtfs' | 'gtfs_rt' | 'gbfs',
    (feed as { feed_name?: string })?.feed_name,
  );

  const structuredData = generateFeedStructuredData(
    feed,
    description,
    relatedFeeds,
    relatedGtfsRtFeeds as GTFSFeedType[],
  );

  if (structuredData == null) return null;

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
      }}
    />
  );
}
