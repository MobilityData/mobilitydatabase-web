// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Polyfills for Node.js environment
import { TextEncoder } from 'util';
global.TextEncoder = TextEncoder;

// Mock fetch for Jest environment
global.fetch = jest.fn();

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({})),
  GithubAuthProvider: jest.fn().mockImplementation(() => ({})),
  OAuthProvider: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn().mockImplementation(async (namespace) => {
    return await Promise.resolve((key: string) => {
      if (namespace === 'common') {
        switch (key) {
          case 'others':
            return 'others';
          case 'gtfsSchedule':
            return 'GTFS schedule';
          case 'gtfsRealtime':
            return 'GTFS realtime';
          default:
            return key;
        }
      }
      if (namespace === 'feeds') {
        switch (key) {
          case 'detailPageDescription':
            return 'Explore the feed details';
          default:
            return key;
        }
      }
      return key;
    });
  }),
  getLocale: jest.fn().mockResolvedValue('en'),
}));

// Mock next/server for middleware tests
jest.mock('next/server', () => {
  const createMockResponse = (
    data?: unknown,
    init?: Record<string, unknown>,
  ): Record<string, unknown> => {
    const status = typeof init?.status === 'number' ? init.status : 200;
    const statusValue = typeof init?.status === 'number' ? init.status : 200;
    return {
      body: data,
      status,
      json: jest.fn().mockResolvedValue(data),
      ok: statusValue < 400,
      headers: new Headers(
        typeof init?.headers === 'object'
          ? (init.headers as HeadersInit)
          : undefined,
      ),
    };
  };

  return {
    NextResponse: {
      next: jest.fn(() => createMockResponse()),
      rewrite: jest.fn((url: unknown, config: unknown) => createMockResponse()),
      redirect: jest.fn((url: unknown) => createMockResponse()),
      json: jest.fn((data: unknown, init: unknown) =>
        createMockResponse(data, init as Record<string, unknown>),
      ),
    },
    NextRequest: jest.fn(),
  };
});
