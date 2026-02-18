/**
 * @jest-environment node
 */
import { POST } from './route';
import { revalidatePath, revalidateTag } from 'next/cache';

// Mock Next.js cache
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

// Mock i18n routing
jest.mock('../../../i18n/routing', () => ({
  AVAILABLE_LOCALES: ['en', 'fr'],
}));

describe('POST /api/revalidate', () => {
  const mockRevalidatePath = revalidatePath as jest.MockedFunction<
    typeof revalidatePath
  >;
  const mockRevalidateTag = revalidateTag as jest.MockedFunction<
    typeof revalidateTag
  >;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Authentication', () => {
    it('returns 500 when REVALIDATE_SECRET is not configured', async () => {
      delete process.env.REVALIDATE_SECRET;

      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'some-secret',
        },
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json).toEqual({
        ok: false,
        error: 'Server misconfigured: REVALIDATE_SECRET missing',
      });
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns 401 when header is missing', async () => {
      process.env.REVALIDATE_SECRET = 'test-secret';

      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json).toEqual({
        ok: false,
        error: 'Unauthorized',
      });
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns 401 when secret does not match', async () => {
      process.env.REVALIDATE_SECRET = 'correct-secret';

      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'wrong-secret',
        },
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json).toEqual({
        ok: false,
        error: 'Unauthorized',
      });
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('accepts request when secret matches', async () => {
      process.env.REVALIDATE_SECRET = 'correct-secret';

      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'correct-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'full',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        ok: true,
        message: 'Revalidation triggered successfully',
      });
    });
  });

  describe('Revalidation types', () => {
    beforeEach(() => {
      process.env.REVALIDATE_SECRET = 'test-secret';
    });

    it('revalidates full site when type is full', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'full',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout');
    });

    it('revalidates all feed pages when type is all-feeds', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'all-feeds',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockRevalidateTag).toHaveBeenCalledWith('guest-feeds', 'max');
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/[locale]/feeds/[feedDataType]/[feedId]',
        'layout',
      );
    });

    it('revalidates all GBFS feed pages when type is all-gbfs-feeds', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'all-gbfs-feeds',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-type-gbfs', 'max');
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/[locale]/feeds/gbfs/[feedId]',
        'layout',
      );
    });

    it('revalidates all GTFS feed pages when type is all-gtfs-feeds', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'all-gtfs-feeds',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-type-gtfs', 'max');
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/[locale]/feeds/gtfs/[feedId]',
        'layout',
      );
    });

    it('revalidates all GTFS-RT feed pages when type is all-gtfs-rt-feeds', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'all-gtfs-rt-feeds',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockRevalidateTag).toHaveBeenCalledWith(
        'feed-type-gtfs_rt',
        'max',
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/[locale]/feeds/gtfs_rt/[feedId]',
        'layout',
      );
    });

    it('revalidates specific GTFS feeds with localized paths', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'specific-feeds',
          gtfsFeedIds: ['feed-1', 'feed-2'],
          gtfsRtFeedIds: [],
          gbfsFeedIds: [],
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);

      // Should invalidate cache tags for each feed
      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-feed-1', 'max');
      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-feed-2', 'max');

      // Each feed should revalidate base path + map path + localized versions
      expect(mockRevalidatePath).toHaveBeenCalledWith('/feeds/gtfs/feed-1');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/feeds/gtfs/feed-1/map');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/fr/feeds/gtfs/feed-1');
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/fr/feeds/gtfs/feed-1/map',
      );

      expect(mockRevalidatePath).toHaveBeenCalledWith('/feeds/gtfs/feed-2');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/feeds/gtfs/feed-2/map');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/fr/feeds/gtfs/feed-2');
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/fr/feeds/gtfs/feed-2/map',
      );

      // Should be called 8 times total (2 feeds × 4 paths each)
      expect(mockRevalidatePath).toHaveBeenCalledTimes(8);
    });

    it('revalidates specific GTFS-RT feeds with localized paths', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'specific-feeds',
          gtfsFeedIds: [],
          gtfsRtFeedIds: ['rt-feed-1'],
          gbfsFeedIds: [],
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);

      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-rt-feed-1', 'max');
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/feeds/gtfs_rt/rt-feed-1',
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/feeds/gtfs_rt/rt-feed-1/map',
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/fr/feeds/gtfs_rt/rt-feed-1',
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/fr/feeds/gtfs_rt/rt-feed-1/map',
      );
      expect(mockRevalidatePath).toHaveBeenCalledTimes(4);
    });

    it('revalidates specific GBFS feeds with localized paths', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'specific-feeds',
          gtfsFeedIds: [],
          gtfsRtFeedIds: [],
          gbfsFeedIds: ['gbfs-feed-1'],
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);

      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-gbfs-feed-1', 'max');
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/feeds/gbfs/gbfs-feed-1',
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/feeds/gbfs/gbfs-feed-1/map',
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/fr/feeds/gbfs/gbfs-feed-1',
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/fr/feeds/gbfs/gbfs-feed-1/map',
      );
      expect(mockRevalidatePath).toHaveBeenCalledTimes(4);
    });

    it('revalidates multiple feed types simultaneously', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'specific-feeds',
          gtfsFeedIds: ['gtfs-1'],
          gtfsRtFeedIds: ['rt-1'],
          gbfsFeedIds: ['gbfs-1'],
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);

      // Should invalidate cache tags for each feed
      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-gtfs-1', 'max');
      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-rt-1', 'max');
      expect(mockRevalidateTag).toHaveBeenCalledWith('feed-gbfs-1', 'max');

      // Should revalidate all three feed types
      expect(mockRevalidatePath).toHaveBeenCalledWith('/feeds/gtfs/gtfs-1');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/feeds/gtfs_rt/rt-1');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/feeds/gbfs/gbfs-1');

      // 3 feeds × 4 paths each = 12 total calls
      expect(mockRevalidatePath).toHaveBeenCalledTimes(12);
    });

    it('handles specific-feeds with empty arrays', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'specific-feeds',
          gtfsFeedIds: [],
          gtfsRtFeedIds: [],
          gbfsFeedIds: [],
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  describe('Request body handling', () => {
    beforeEach(() => {
      process.env.REVALIDATE_SECRET = 'test-secret';
    });

    it('uses default options when body is missing', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
        },
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      // Default type is 'specific-feeds' with empty arrays
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('uses default options when body is invalid JSON', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: 'invalid json{',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      // Should fall back to default options (specific-feeds with empty arrays)
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('accepts partial body with only type specified', async () => {
      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'all-feeds',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mockRevalidateTag).toHaveBeenCalledWith('guest-feeds', 'max');
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/[locale]/feeds/[feedDataType]/[feedId]',
        'layout',
      );
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      process.env.REVALIDATE_SECRET = 'test-secret';
    });

    it('returns 500 when revalidatePath throws an error', async () => {
      mockRevalidatePath.mockImplementationOnce(() => {
        throw new Error('Revalidation error');
      });

      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'full',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json).toEqual({
        ok: false,
        error: 'Failed to revalidate',
      });
    });

    it('logs error when revalidation fails', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const testError = new Error('Test revalidation error');

      mockRevalidatePath.mockImplementationOnce(() => {
        throw testError;
      });

      const request = new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        headers: {
          'x-revalidate-secret': 'test-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'full',
        }),
      });

      await POST(request);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Revalidation failed:',
        testError,
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
