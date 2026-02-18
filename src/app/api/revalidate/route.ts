import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { AVAILABLE_LOCALES } from '../../../i18n/routing';

type RevalidateTypes =
  | 'full'
  | 'all-feeds'
  | 'all-gbfs-feeds'
  | 'all-gtfs-rt-feeds'
  | 'all-gtfs-feeds'
  | 'specific-feeds';

interface RevalidateBody {
  gtfsFeedIds: string[]; // optional list of specific feed IDs to revalidate
  gtfsRtFeedIds: string[]; // optional list of specific GTFS-RT feed IDs to revalidate
  gbfsFeedIds: string[]; // optional list of specific GBFS feed IDs to revalidate
  type: RevalidateTypes; // optional, controls scope of revalidation
}

const defaultRevalidateOptions: RevalidateBody = {
  // By default it will revalidate nothing
  type: 'specific-feeds',
  gtfsFeedIds: [],
  gtfsRtFeedIds: [],
  gbfsFeedIds: [],
};

export async function POST(req: Request): Promise<NextResponse> {
  const expectedSecret = process.env.REVALIDATE_SECRET;
  if (expectedSecret == null) {
    return NextResponse.json(
      { ok: false, error: 'Server misconfigured: REVALIDATE_SECRET missing' },
      { status: 500 },
    );
  }

  const providedSecret = req.headers.get('x-revalidate-secret');
  if (providedSecret == null || providedSecret !== expectedSecret) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  let payload: RevalidateBody = { ...defaultRevalidateOptions }; // default to full revalidation if body is missing/invalid
  try {
    payload = (await req.json()) as RevalidateBody;
  } catch {
    payload = { ...defaultRevalidateOptions };
  }

  // NOTE
  // revalidatePath = triggers revalidation for entire page cache
  // revalidateTag = triggers revalidation for API calls using `unstable_cache` with matching tags (e.g., feed-123, guest-feeds)

  try {
    // clears cache for entire site
    if (payload.type === 'full') {
      revalidatePath('/', 'layout');
    }

    // clears cache for all feed pages (ISR-cached layout)
    if (payload.type === 'all-feeds') {
      revalidateTag('guest-feeds', 'max');
      revalidatePath('/[locale]/feeds/[feedDataType]/[feedId]', 'layout');
    }

    // clears cache for all GBFS feed pages (ISR-cached layout)
    if (payload.type === 'all-gbfs-feeds') {
      revalidateTag('feed-type-gbfs', 'max');
      revalidatePath('/[locale]/feeds/gbfs/[feedId]', 'layout');
    }

    // clears cache for all GTFS feed pages (ISR-cached layout)
    if (payload.type === 'all-gtfs-feeds') {
      revalidateTag('feed-type-gtfs', 'max');
      revalidatePath('/[locale]/feeds/gtfs/[feedId]', 'layout');
    }

    // clears cache for all GTFS RT feed pages (ISR-cached layout)
    if (payload.type === 'all-gtfs-rt-feeds') {
      revalidateTag('feed-type-gtfs_rt', 'max');
      revalidatePath('/[locale]/feeds/gtfs_rt/[feedId]', 'layout');
    }

    // clears cache for specific feed pages (ISR-cached page) + localized paths
    if (payload.type === 'specific-feeds') {
      const localPaths = AVAILABLE_LOCALES.filter((loc) => loc !== 'en');
      const pathsToRevalidate: string[] = [];

      payload.gtfsFeedIds.forEach((id) => {
        revalidateTag(`feed-${id}`, 'max');
        pathsToRevalidate.push(`/feeds/gtfs/${id}`);
      });

      payload.gtfsRtFeedIds.forEach((id) => {
        revalidateTag(`feed-${id}`, 'max');
        pathsToRevalidate.push(`/feeds/gtfs_rt/${id}`);
      });

      payload.gbfsFeedIds.forEach((id) => {
        revalidateTag(`feed-${id}`, 'max');
        pathsToRevalidate.push(`/feeds/gbfs/${id}`);
      });

      pathsToRevalidate.forEach((path) => {
        revalidatePath(path);
        revalidatePath(path + '/map');
        localPaths.forEach((loc) => {
          revalidatePath(`/${loc}${path}`);
          revalidatePath(`/${loc}${path}/map`);
        });
      });
    }

    return NextResponse.json({
      ok: true,
      message: 'Revalidation triggered successfully',
    });
  } catch (error) {
    console.error('Revalidation failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to revalidate',
      },
      { status: 500 },
    );
  }
}
