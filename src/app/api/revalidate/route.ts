import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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
  // By default, revalidate the entire site to ensure consistency across pages
  type: 'specific-feeds',
  gtfsFeedIds: [],
  gtfsRtFeedIds: [],
  gbfsFeedIds: [],
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  const expectedSecret = process.env.REVALIDATE_SECRET;
  if (!expectedSecret) {
    return json(500, {
      ok: false,
      error: 'Server misconfigured: REVALIDATE_SECRET missing',
    });
  }

  const providedSecret = req.headers.get('x-revalidate-secret');
  if (!providedSecret || providedSecret !== expectedSecret) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  let payload: RevalidateBody = { ...defaultRevalidateOptions }; // default to full revalidation if body is missing/invalid
  try {
    payload = (await req.json()) as RevalidateBody;
  } catch {
    // Body is optional; allow empty/invalid JSON to keep endpoint robust
    payload = { ...defaultRevalidateOptions };
  }

  try {
    // clears cache for entire site
    if (payload.type === 'full') {
      revalidatePath('/', 'layout');
    }

    // clears cache for all feed pages (ISR-cached layout)
    if (payload.type === 'all-feeds') {
      revalidatePath('/[locale]/feeds/[feedDataType]/[feedId]', 'layout');
    }

    // clears cache for all GBFS feed pages (ISR-cached layout)
    if (payload.type === 'all-gbfs-feeds') {
      revalidatePath('/[locale]/feeds/gbfs/[feedId]', 'layout');
    }

    // clears cache for all GTFS feed pages (ISR-cached layout)
    if (payload.type === 'all-gtfs-feeds') {
      revalidatePath('/[locale]/feeds/gtfs/[feedId]', 'layout');
    }

    // clears cache for all GTFS RT feed pages (ISR-cached layout)
    if (payload.type === 'all-gtfs-rt-feeds') {
      revalidatePath('/[locale]/feeds/gtfs_rt/[feedId]', 'layout');
    }

    // clears cache for specific feed pages (ISR-cached page) + localized paths
    if (payload.type === 'specific-feeds') {
      const localPaths = AVAILABLE_LOCALES.filter((loc) => loc !== 'en');
      const pathsToRevalidate: string[] = [];

      payload.gtfsFeedIds.forEach((id) => {
        pathsToRevalidate.push(`/feeds/gtfs/${id}`);
      });

      payload.gtfsRtFeedIds.forEach((id) => {
        pathsToRevalidate.push(`/feeds/gtfs_rt/${id}`);
      });

      payload.gbfsFeedIds.forEach((id) => {
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

    return json(200, {
      ok: true,
      message: 'Revalidation triggered successfully',
    });
  } catch (error) {
    console.error('Revalidation failed:', error);
    return json(500, {
      ok: false,
      error: 'Failed to revalidate',
    });
  }
}
