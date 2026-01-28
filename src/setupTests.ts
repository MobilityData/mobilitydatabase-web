// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Polyfills for Node.js environment
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

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
