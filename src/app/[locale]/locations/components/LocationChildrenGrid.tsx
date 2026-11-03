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
  getTotalFeedCount,
  sortByFeedCount,
  type LocationDirectoryNode,
} from '../lib/location-directory';

interface Props {
  nodes: LocationDirectoryNode[];
  /** Slugs of the current node; each child links one level deeper. */
  parentSlugs: string[];
  locale: string;
}

function getFlag(node: LocationDirectoryNode): string | undefined {
  if (node.level !== 'country' || node.code == undefined) return undefined;
  const flag = getEmojiFlag(node.code.toUpperCase() as TCountryCode);
  return flag !== '' ? flag : undefined;
}

/**
 * Child nodes, most feeds first. Everything that needs the server (flags,
 * translations, number formatting) is resolved here so the client list only
 * filters plain data.
 */
export default async function LocationChildrenGrid({
  nodes,
  parentSlugs,
  locale,
}: Props): Promise<ReactElement> {
  const t = await getTranslations('locations');

  const items: LocationChildItem[] = sortByFeedCount(
    nodes.map((node) => ({
      node,
      name: node.name ?? node.slug ?? '',
      counts: node.feed_counts,
    })),
  ).map(({ node, name, counts }) => ({
    slug: node.slug ?? '',
    name,
    flag: getFlag(node),
    href: buildLocationHref([...parentSlugs, node.slug ?? '']),
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
  }));

  return <LocationChildrenList items={items} />;
}
