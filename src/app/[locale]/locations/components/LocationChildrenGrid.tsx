import { type ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import { getEmojiFlag, type TCountryCode } from 'countries-list';
import LocationChildrenList, {
  type LocationChildItem,
} from './LocationChildrenList';
import {
  buildLocationHref,
  formatCount,
  getFeedCountEntries,
  getLocationName,
  getLocationSegments,
  getTotalFeedCount,
  sortByFeedCount,
  type LocationResult,
} from '../lib/location-directory';

interface Props {
  locations: LocationResult[];
  /**
   * Continent slug of the current page; empty at the root, where the
   * children are the continents themselves.
   */
  continent: string;
  locale: string;
}

function getFlag(location: LocationResult): string | undefined {
  if (
    location.location_type !== 'country' ||
    location.country_code == undefined
  )
    return undefined;
  const flag = getEmojiFlag(
    location.country_code.toUpperCase() as TCountryCode,
  );
  return flag !== '' ? flag : undefined;
}

/**
 * Child locations, most feeds first. Everything that needs the server
 * (flags, translations, number formatting, links) is resolved here so the
 * client list only filters plain data.
 */
export default async function LocationChildrenGrid({
  locations,
  continent,
  locale,
}: Props): Promise<ReactElement> {
  const t = await getTranslations('locations');

  const items: LocationChildItem[] = sortByFeedCount(
    locations.map((location) => ({
      location,
      name: getLocationName(location),
      counts: location.feed_counts,
    })),
  ).map(({ location, name, counts }) => {
    const href = buildLocationHref(getLocationSegments(continent, location));
    return {
      key: href,
      name,
      flag: getFlag(location),
      href,
      totalLabel: t.rich('childFeedTotal', {
        count: getTotalFeedCount(counts),
        b: (chunks) => <strong>{chunks}</strong>,
      }),
      counts: getFeedCountEntries(counts).map(({ dataType, count }) => ({
        dataType,
        count,
        formattedCount: formatCount(count, locale),
        typeLabel: t(`shortLabels.${dataType}`),
      })),
    };
  });

  return <LocationChildrenList items={items} />;
}
