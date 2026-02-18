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

jest.mock('leaflet/dist/leaflet.css', () => ({}));
jest.mock('react-leaflet', () => ({}));

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
  const createMockResponse = (data?: any, init?: any) => ({
    body: data,
    status: init?.status || 200,
    json: jest.fn().mockResolvedValue(data),
    ok: (init?.status || 200) < 400,
    headers: new Headers(init?.headers),
  });

  return {
    NextResponse: {
      next: jest.fn(() => createMockResponse()),
      rewrite: jest.fn((url, config) => createMockResponse()),
      redirect: jest.fn((url) => createMockResponse()),
      json: jest.fn((data, init) => createMockResponse(data, init)),
    },
    NextRequest: jest.fn(),
  };
});
