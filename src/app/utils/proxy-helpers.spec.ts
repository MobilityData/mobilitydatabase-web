import {
  isFeedDetailPage,
  rewriteFeedRequest,
  hasLocaleInPathname,
  rewriteWithDefaultLocale,
  DEFAULT_LOCALE,
  AUTHED_PROXY_HEADER,
  STATIC_PROXY_HEADER,
} from './proxy-helpers';

// Mock the session-jwt module
jest.mock('./session-jwt');

// Helper to create mock NextRequest
/* eslint-disable @typescript-eslint/consistent-type-assertions */
function createMockNextRequest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    nextUrl: {
      clone: jest.fn(function (this: Record<string, unknown>) {
        const url = new URL('http://localhost');
        url.pathname = '/original';
        return url;
      }),
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    } as Record<string, unknown>,
    headers: new Headers(),
    cookies: {
      get: jest.fn(),
    } as Record<string, unknown>,
    ...overrides,
  };
}
/* eslint-enable @typescript-eslint/consistent-type-assertions */

// Mock routing module
jest.mock('../../i18n/routing', () => ({
  routing: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
  },
}));

// Spy on NextResponse.rewrite
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
let rewriteSpy: jest.SpyInstance;
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
let NextResponse: any;

describe('proxy-helpers', () => {
  beforeAll(async () => {
    // Dynamically import NextResponse to avoid module loading issues
    const nextServer = await import('next/server');
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    NextResponse = nextServer.NextResponse as any;
    rewriteSpy = jest.spyOn(NextResponse, 'rewrite');
  });

  afterEach(() => {
    rewriteSpy.mockClear();
  });

  afterAll(() => {
    rewriteSpy.mockRestore();
  });

  // ============================================================================
  // isFeedDetailPage Tests
  // ============================================================================

  describe('isFeedDetailPage', () => {
    it('should match feed detail page without locale prefix', () => {
      const result = isFeedDetailPage('/feeds/gtfs/mdb-123');
      expect(result).toEqual({
        match: true,
        locale: undefined,
        feedDataType: 'gtfs',
        feedId: 'mdb-123',
        subPath: '',
      });
    });

    it('should match feed detail page with locale prefix', () => {
      const result = isFeedDetailPage('/en/feeds/gtfs_rt/test-456');
      expect(result).toEqual({
        match: true,
        locale: 'en',
        feedDataType: 'gtfs_rt',
        feedId: 'test-456',
        subPath: '',
      });
    });

    it('should match feed detail page with subpath', () => {
      const result = isFeedDetailPage('/feeds/gbfs/mdb-789/map');
      expect(result).toEqual({
        match: true,
        locale: undefined,
        feedDataType: 'gbfs',
        feedId: 'mdb-789',
        subPath: '/map',
      });
    });

    it('should match feed detail page with multi-level subpath', () => {
      const result = isFeedDetailPage('/fr/feeds/gtfs/mdb-123/details/info');
      expect(result).toEqual({
        match: true,
        locale: 'fr',
        feedDataType: 'gtfs',
        feedId: 'mdb-123',
        subPath: '/details/info',
      });
    });

    it('should not match non-feed paths', () => {
      const result = isFeedDetailPage('/home');
      expect(result).toEqual({ match: false });
    });

    it('should not match feed paths with invalid data types', () => {
      const result = isFeedDetailPage('/feeds/invalid/mdb-123');
      expect(result).toEqual({ match: false });
    });

    it('should not match incomplete feed paths', () => {
      const result = isFeedDetailPage('/feeds/gtfs');
      expect(result).toEqual({ match: false });
    });

    it('should handle paths with query strings gracefully', () => {
      const result = isFeedDetailPage('/feeds/gtfs/mdb-123?param=value');
      expect(result).toEqual({ match: false });
    });
  });

  // ============================================================================
  // rewriteFeedRequest Tests
  // ============================================================================

  describe('rewriteFeedRequest', () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = createMockNextRequest();
      jest.clearAllMocks();
    });

    it('should construct correct pathname for authed route', () => {
      const clonedUrl = new URL('http://localhost');
      (mockRequest.nextUrl.clone as jest.Mock).mockReturnValue(clonedUrl);

      rewriteFeedRequest(mockRequest, {
        locale: 'en',
        feedDataType: 'gtfs_rt',
        feedId: 'mdb-789',
        subPath: '/map',
        routeType: 'authed',
      });

      expect(clonedUrl.pathname).toBe('/en/feeds/gtfs_rt/mdb-789/authed/map');
    });

    it('should construct correct pathname for static route', () => {
      const clonedUrl = new URL('http://localhost');
      (mockRequest.nextUrl.clone as jest.Mock).mockReturnValue(clonedUrl);

      rewriteFeedRequest(mockRequest, {
        locale: 'fr',
        feedDataType: 'gbfs',
        feedId: 'test-456',
        subPath: '',
        routeType: 'static',
      });

      expect(clonedUrl.pathname).toBe('/fr/feeds/gbfs/test-456/static');
    });

    it('should set authed proxy header in rewrite request', () => {
      const clonedUrl = new URL('http://localhost');
      (mockRequest.nextUrl.clone as jest.Mock).mockReturnValue(clonedUrl);

      rewriteFeedRequest(mockRequest, {
        locale: 'en',
        feedDataType: 'gtfs',
        feedId: 'mdb-123',
        subPath: '',
        routeType: 'authed',
      });

      const callArgs = rewriteSpy.mock.calls[0];
      const requestHeaders = callArgs[1].request.headers;
      expect(requestHeaders.get(AUTHED_PROXY_HEADER)).toBe('1');
    });

    it('should set static proxy header in rewrite request', () => {
      const clonedUrl = new URL('http://localhost');
      (mockRequest.nextUrl.clone as jest.Mock).mockReturnValue(clonedUrl);

      rewriteFeedRequest(mockRequest, {
        locale: 'fr',
        feedDataType: 'gbfs',
        feedId: 'test-456',
        subPath: '',
        routeType: 'static',
      });

      const callArgs = rewriteSpy.mock.calls[0];
      const requestHeaders = callArgs[1].request.headers;
      expect(requestHeaders.get(STATIC_PROXY_HEADER)).toBe('1');
    });
  });

  // ============================================================================
  // hasLocaleInPathname Tests
  // ============================================================================

  describe('hasLocaleInPathname', () => {
    it('should return true for /en/ prefix', () => {
      const result = hasLocaleInPathname('/en/feeds/gtfs/mdb-123');
      expect(result).toBe(true);
    });

    it('should return true for /fr/ prefix', () => {
      const result = hasLocaleInPathname('/fr/feeds/gtfs/mdb-123');
      expect(result).toBe(true);
    });

    it('should return true for locale-only path /en', () => {
      const result = hasLocaleInPathname('/en');
      expect(result).toBe(true);
    });

    it('should return true for locale-only path /fr', () => {
      const result = hasLocaleInPathname('/fr');
      expect(result).toBe(true);
    });

    it('should return false for paths without locale', () => {
      const result = hasLocaleInPathname('/feeds/gtfs/mdb-123');
      expect(result).toBe(false);
    });

    it('should return false for unsupported locales', () => {
      const result = hasLocaleInPathname('/de/feeds/gtfs/mdb-123');
      expect(result).toBe(false);
    });

    it('should return false for locale-like substrings in path', () => {
      const result = hasLocaleInPathname('/feeds/en/mdb-123');
      expect(result).toBe(false);
    });

    it('should return false for empty path', () => {
      const result = hasLocaleInPathname('/');
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // rewriteWithDefaultLocale Tests
  // ============================================================================

  describe('rewriteWithDefaultLocale', () => {
    let mockUrl: URL;

    beforeEach(() => {
      mockUrl = new URL('http://localhost/feeds/gtfs/mdb-123');
    });

    it('should prepend default locale to pathname', () => {
      rewriteWithDefaultLocale(mockUrl);
      expect(mockUrl.pathname).toBe(`/${DEFAULT_LOCALE}/feeds/gtfs/mdb-123`);
    });

    it('should prepend default locale to root path', () => {
      mockUrl = new URL('http://localhost/');
      rewriteWithDefaultLocale(mockUrl);
      expect(mockUrl.pathname).toBe(`/${DEFAULT_LOCALE}/`);
    });

    it('should handle paths with multiple segments', () => {
      mockUrl = new URL('http://localhost/feeds/gbfs/test-456/map/details');
      rewriteWithDefaultLocale(mockUrl);
      expect(mockUrl.pathname).toBe(
        `/${DEFAULT_LOCALE}/feeds/gbfs/test-456/map/details`,
      );
    });

    it('should return NextResponse', () => {
      const mockUrl = new URL('http://localhost/feeds/gtfs/mdb-123');
      const result = rewriteWithDefaultLocale(mockUrl);
      expect(result).toBeDefined();
    });
  });
});
