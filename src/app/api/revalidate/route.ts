import { NextResponse } from 'next/server';
import { nonEmpty } from '../../utils/config';
import {
  revalidateFullSite,
  revalidateAllFeeds,
  revalidateAllGbfsFeeds,
  revalidateAllGtfsFeeds,
  revalidateAllGtfsRtFeeds,
  revalidateSpecificFeeds,
} from '../../utils/revalidate-feeds';

const VALID_REVALIDATE_TYPES = [
  'full',
  'all-feeds',
  'all-gbfs-feeds',
  'all-gtfs-rt-feeds',
  'all-gtfs-feeds',
  'specific-feeds',
] as const;

type RevalidateTypes = (typeof VALID_REVALIDATE_TYPES)[number];

interface RevalidateBody {
  feedIds: string[]; // only for 'specific-feeds' revalidation type
  type: RevalidateTypes;
}

const defaultRevalidateOptions: RevalidateBody = {
  // By default it will revalidate nothing
  type: 'specific-feeds',
  feedIds: [],
};

/**
 * GET handler for the Vercel cron job that revalidates all GBFS feed pages.
 * Vercel automatically passes Authorization: Bearer <CRON_SECRET> with each invocation.
 * Configured in vercel.json under "crons" for 4am UTC Monday-Saturday and 7am UTC Sunday.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret == null) {
    return NextResponse.json(
      { ok: false, error: 'Server misconfigured: CRON_SECRET missing' },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  try {
    revalidateAllGbfsFeeds();
    console.log(
      '[cron] revalidate /api/revalidate: all-gbfs-feeds revalidation triggered',
    );
    return NextResponse.json({
      ok: true,
      message: 'All GBFS feeds revalidated successfully',
    });
  } catch (error) {
    console.error(
      '[cron] revalidate /api/revalidate: revalidation failed:',
      error,
    );
    return NextResponse.json(
      { ok: false, error: 'Revalidation failed' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const expectedSecret = nonEmpty(process.env.REVALIDATE_SECRET);
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
    const body = (await req.json()) as RevalidateBody;
    payload = {
      ...defaultRevalidateOptions,
      ...body,
    };
  } catch (parseError) {
    console.error(
      'Failed to parse request body, falling back to defaults:',
      parseError,
    );
    payload = { ...defaultRevalidateOptions };
  }

  if (!VALID_REVALIDATE_TYPES.includes(payload.type)) {
    return NextResponse.json(
      { ok: false, error: 'invalid or missing type parameter' },
      { status: 500 },
    );
  }

  // NOTE
  // revalidatePath = triggers revalidation for entire page cache
  // revalidateTag = triggers revalidation for API calls using `unstable_cache` with matching tags (e.g., feed-123, guest-feeds)

  try {
    if (payload.type === 'full') revalidateFullSite();
    if (payload.type === 'all-feeds') revalidateAllFeeds();
    if (payload.type === 'all-gbfs-feeds') revalidateAllGbfsFeeds();
    if (payload.type === 'all-gtfs-feeds') revalidateAllGtfsFeeds();
    if (payload.type === 'all-gtfs-rt-feeds') revalidateAllGtfsRtFeeds();
    if (payload.type === 'specific-feeds')
      revalidateSpecificFeeds(payload.feedIds);

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
