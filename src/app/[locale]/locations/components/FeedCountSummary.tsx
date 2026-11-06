import { type ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import FeedCountChips from './FeedCountChips';
import {
  formatCount,
  getFeedCountEntries,
  type FeedCountDataType,
  type LocationFeedCounts,
} from '../lib/location-directory';

interface Props {
  counts: LocationFeedCounts | undefined;
  locale: string;
}

const LABEL_KEYS: Record<FeedCountDataType, string> = {
  gtfs: 'gtfsSchedule',
  gtfs_rt: 'gtfsRealtime',
  gbfs: 'gbfs',
};

/** The node's feed totals split by GTFS Schedule / GTFS Realtime / GBFS. */
export default async function FeedCountSummary({
  counts,
  locale,
}: Props): Promise<ReactElement> {
  const [tCommon, t] = await Promise.all([
    getTranslations('common'),
    getTranslations('locations'),
  ]);

  return (
    <div data-testid='location-feed-counts'>
      <FeedCountChips
        ariaLabel={t('feedCountsAria')}
        chips={getFeedCountEntries(counts).map(({ dataType, count }) => ({
          dataType,
          count,
          label: `${formatCount(count, locale)} ${tCommon(LABEL_KEYS[dataType])}`,
        }))}
      />
    </div>
  );
}
