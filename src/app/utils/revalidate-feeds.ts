import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { AVAILABLE_LOCALES } from '../../i18n/routing';

/**
 * Revalidates the ISR cache for specific feed pages.
 * Applies to all feed types (gtfs, gtfs_rt, gbfs) since we don't know the type from the id alone.
 * Also revalidates localized paths and /map sub-routes.
 */
export function revalidateSpecificFeeds(feedIds: string[]): void {
  const localPaths = AVAILABLE_LOCALES.filter((loc) => loc !== 'en');
  const pathsToRevalidate: string[] = [];

  feedIds.forEach((id) => {
    revalidateTag(`feed-${id}`, 'max');
    // The id will try to revalidate all feed types with that id, but that's necessary since we don't know the feed type here and it's not a big deal if we revalidate some non-existent pages
    pathsToRevalidate.push(`/feeds/gtfs/${id}`);
    pathsToRevalidate.push(`/feeds/gtfs_rt/${id}`);
    pathsToRevalidate.push(`/feeds/gbfs/${id}`);
  });

  console.log('Revalidating paths:', pathsToRevalidate);

  pathsToRevalidate.forEach((path) => {
    revalidatePath(path);
    revalidatePath(path + '/map');
    localPaths.forEach((loc) => {
      revalidatePath(`/${loc}${path}`);
      revalidatePath(`/${loc}${path}/map`);
    });
  });
}

/** Clears cache for all feed pages (ISR-cached layout). */
export function revalidateAllFeeds(): void {
  revalidateTag('guest-feeds', 'max');
  revalidatePath('/[locale]/feeds/[feedDataType]/[feedId]', 'layout');
}

/** Clears cache for all GBFS feed pages (ISR-cached layout). */
export function revalidateAllGbfsFeeds(): void {
  revalidateTag('feed-type-gbfs', 'max');
  revalidatePath('/[locale]/feeds/gbfs/[feedId]', 'layout');
}

/** Clears cache for all GTFS feed pages (ISR-cached layout). */
export function revalidateAllGtfsFeeds(): void {
  revalidateTag('feed-type-gtfs', 'max');
  revalidatePath('/[locale]/feeds/gtfs/[feedId]', 'layout');
}

/** Clears cache for all GTFS-RT feed pages (ISR-cached layout). */
export function revalidateAllGtfsRtFeeds(): void {
  revalidateTag('feed-type-gtfs_rt', 'max');
  revalidatePath('/[locale]/feeds/gtfs_rt/[feedId]', 'layout');
}

/** Clears cache for the entire site. */
export function revalidateFullSite(): void {
  revalidateTag('guest-feeds', 'max');
  revalidatePath('/', 'layout');
}
