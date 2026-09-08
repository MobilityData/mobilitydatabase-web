/**
 * @jest-environment node
 */

import { revalidatePath, revalidateTag } from 'next/cache';
import { revalidateSpecificFeeds } from './revalidate-feeds';

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

// routing.ts pulls in ESM-only next-intl/routing, which Jest doesn't
// transform; only the locale list matters here.
jest.mock('../../i18n/routing', () => ({
  AVAILABLE_LOCALES: ['en', 'fr'],
}));

const mockRevalidatePath = revalidatePath as jest.MockedFunction<
  typeof revalidatePath
>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
>;

describe('revalidateSpecificFeeds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('revalidates the feed tag so every cached fetch for it is dropped', () => {
    revalidateSpecificFeeds(['mdb-1']);

    expect(mockRevalidateTag).toHaveBeenCalledWith('feed-mdb-1', 'max');
  });

  it('revalidates the detail page and every sub-route, in both locales', () => {
    revalidateSpecificFeeds(['mdb-1']);

    const paths = mockRevalidatePath.mock.calls.map(([path]) => path);

    // The seal analysis page caches separately from the detail page, so an
    // on-demand revalidation has to name it explicitly.
    expect(paths).toEqual(
      expect.arrayContaining([
        '/feeds/gtfs/mdb-1',
        '/feeds/gtfs/mdb-1/map',
        '/feeds/gtfs/mdb-1/seal-of-reliability',
        '/fr/feeds/gtfs/mdb-1',
        '/fr/feeds/gtfs/mdb-1/map',
        '/fr/feeds/gtfs/mdb-1/seal-of-reliability',
      ]),
    );
  });

  it('covers all three feed types, since the id alone does not say which', () => {
    revalidateSpecificFeeds(['mdb-1']);

    const paths = mockRevalidatePath.mock.calls.map(([path]) => path);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/feeds/gtfs/mdb-1/seal-of-reliability',
        '/feeds/gtfs_rt/mdb-1/seal-of-reliability',
        '/feeds/gbfs/mdb-1/seal-of-reliability',
      ]),
    );
  });

  it('handles several feeds at once', () => {
    revalidateSpecificFeeds(['mdb-1', 'mdb-2']);

    expect(mockRevalidateTag).toHaveBeenCalledWith('feed-mdb-1', 'max');
    expect(mockRevalidateTag).toHaveBeenCalledWith('feed-mdb-2', 'max');
  });
});
