/**
 * @jest-environment node
 */

import {
  getRemoteConfigValuesForUser,
  getUserRemoteConfigValues,
  refreshRemoteConfig,
  applyAdminBypass,
} from './remote-config.server';
import {
  defaultRemoteConfigValues,
  matchesFeatureFlagBypass,
} from '../app/interface/RemoteConfig';

jest.mock('server-only', () => ({}));
jest.mock('react', () => ({
  cache: (fn: unknown) => fn,
}));
jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: jest.fn(),
}));

const mockGetTemplate = jest.fn();

jest.mock('firebase-admin/remote-config', () => ({
  getRemoteConfig: jest.fn(() => ({ getTemplate: mockGetTemplate })),
}));

jest.mock('../app/utils/config', () => ({
  getEnvConfig: jest.fn().mockReturnValue(''),
}));

const mockGetCurrentUserFromCookie = jest.fn();

jest.mock('../app/utils/auth-server', () => ({
  getCurrentUserFromCookie: (...args: unknown[]) =>
    mockGetCurrentUserFromCookie(...args),
}));

jest.mock('./firebase-admin', () => ({
  getFirebaseAdminApp: jest.fn().mockReturnValue({}),
}));

const BYPASS_CONFIG = JSON.stringify({ regex: ['.+@mobilitydata\\.org'] });

describe('remote-config.server', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('matchesFeatureFlagBypass', () => {
    it('returns true for matching email', () => {
      expect(
        matchesFeatureFlagBypass('engineer@mobilitydata.org', BYPASS_CONFIG),
      ).toBe(true);
    });

    it('returns false for non-matching email', () => {
      expect(matchesFeatureFlagBypass('user@example.com', BYPASS_CONFIG)).toBe(
        false,
      );
    });

    it('returns false for empty featureFlagBypass', () => {
      expect(matchesFeatureFlagBypass('engineer@mobilitydata.org', '')).toBe(
        false,
      );
    });

    it('returns false for null email', () => {
      expect(matchesFeatureFlagBypass(null, BYPASS_CONFIG)).toBe(false);
    });

    it('returns false for undefined email', () => {
      expect(matchesFeatureFlagBypass(undefined, BYPASS_CONFIG)).toBe(false);
    });

    it('returns false for invalid JSON', () => {
      expect(
        matchesFeatureFlagBypass('engineer@mobilitydata.org', 'not-json'),
      ).toBe(false);
    });

    it('returns false when regex key is missing', () => {
      expect(
        matchesFeatureFlagBypass(
          'engineer@mobilitydata.org',
          JSON.stringify({ other: [] }),
        ),
      ).toBe(false);
    });
  });

  describe('applyAdminBypass', () => {
    it('sets all boolean flags to true', () => {
      const config = {
        ...defaultRemoteConfigValues,
        enableMetrics: false,
        enableLanguageToggle: false,
      };
      const result = applyAdminBypass(config);
      expect(result.enableMetrics).toBe(true);
      expect(result.enableLanguageToggle).toBe(true);
      expect(result.enableFeedStatusBadge).toBe(true);
    });

    it('preserves non-boolean values', () => {
      const config = {
        ...defaultRemoteConfigValues,
        gtfsMetricsBucketEndpoint: 'https://custom-endpoint.com',
        visualizationMapFullDataLimit: 10,
      };
      const result = applyAdminBypass(config);
      expect(result.gtfsMetricsBucketEndpoint).toBe(
        'https://custom-endpoint.com',
      );
      expect(result.visualizationMapFullDataLimit).toBe(10);
    });
  });

  describe('getRemoteConfigValuesForUser', () => {
    it('returns base config when email does not match featureFlagBypass', async () => {
      mockGetTemplate.mockResolvedValue({
        parameters: {
          enableMetrics: { defaultValue: { value: 'false' } },
          featureFlagBypass: { defaultValue: { value: BYPASS_CONFIG } },
        },
      });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser('user@example.com');

      expect(result.enableMetrics).toBe(false);
      expect(result.enableLanguageToggle).toBe(
        defaultRemoteConfigValues.enableLanguageToggle,
      );
    });

    it('returns config with all boolean flags true when email matches featureFlagBypass', async () => {
      mockGetTemplate.mockResolvedValue({
        parameters: {
          enableMetrics: { defaultValue: { value: 'false' } },
          enableLanguageToggle: { defaultValue: { value: 'false' } },
          featureFlagBypass: { defaultValue: { value: BYPASS_CONFIG } },
        },
      });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser(
        'engineer@mobilitydata.org',
      );

      expect(result.enableMetrics).toBe(true);
      expect(result.enableLanguageToggle).toBe(true);
      expect(result.enableFeedStatusBadge).toBe(true);
      expect(result.enableDetailedCoveredArea).toBe(true);
      expect(result.gbfsValidator).toBe(true);
    });

    it('returns base config when featureFlagBypass is empty', async () => {
      mockGetTemplate.mockResolvedValue({
        parameters: {
          enableMetrics: { defaultValue: { value: 'false' } },
          featureFlagBypass: { defaultValue: { value: '' } },
        },
      });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser(
        'engineer@mobilitydata.org',
      );

      expect(result.enableMetrics).toBe(false);
    });

    it('returns base config for undefined email', async () => {
      mockGetTemplate.mockResolvedValue({
        parameters: {
          featureFlagBypass: { defaultValue: { value: BYPASS_CONFIG } },
        },
      });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser(undefined);

      expect(result.enableMetrics).toBe(
        defaultRemoteConfigValues.enableMetrics,
      );
    });

    it('preserves non-boolean config values when applying bypass', async () => {
      mockGetTemplate.mockResolvedValue({
        parameters: {
          gtfsMetricsBucketEndpoint: {
            defaultValue: {
              value: 'https://storage.googleapis.com/custom-gtfs-bucket',
            },
          },
          visualizationMapFullDataLimit: {
            defaultValue: { value: '10' },
          },
          featureFlagBypass: { defaultValue: { value: BYPASS_CONFIG } },
        },
      });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser(
        'engineer@mobilitydata.org',
      );

      expect(result.gtfsMetricsBucketEndpoint).toBe(
        'https://storage.googleapis.com/custom-gtfs-bucket',
      );
      expect(result.visualizationMapFullDataLimit).toBe(10);
      expect(result.enableMetrics).toBe(true);
    });
  });

  describe('getUserRemoteConfigValues', () => {
    it('returns bypass config for authenticated admin user', async () => {
      mockGetCurrentUserFromCookie.mockResolvedValue({
        email: 'engineer@mobilitydata.org',
      });
      mockGetTemplate.mockResolvedValue({
        parameters: {
          enableMetrics: { defaultValue: { value: 'false' } },
          featureFlagBypass: { defaultValue: { value: BYPASS_CONFIG } },
        },
      });
      await refreshRemoteConfig();

      const result = await getUserRemoteConfigValues();

      expect(result.enableMetrics).toBe(true);
    });

    it('returns base config for non-admin authenticated user', async () => {
      mockGetCurrentUserFromCookie.mockResolvedValue({
        email: 'user@example.com',
      });
      mockGetTemplate.mockResolvedValue({
        parameters: {
          enableMetrics: { defaultValue: { value: 'false' } },
          featureFlagBypass: { defaultValue: { value: BYPASS_CONFIG } },
        },
      });
      await refreshRemoteConfig();

      const result = await getUserRemoteConfigValues();

      expect(result.enableMetrics).toBe(false);
    });

    it('returns base config for unauthenticated user', async () => {
      mockGetCurrentUserFromCookie.mockResolvedValue(undefined);
      mockGetTemplate.mockResolvedValue({
        parameters: {
          enableMetrics: { defaultValue: { value: 'false' } },
          featureFlagBypass: { defaultValue: { value: BYPASS_CONFIG } },
        },
      });
      await refreshRemoteConfig();

      const result = await getUserRemoteConfigValues();

      expect(result.enableMetrics).toBe(false);
    });
  });

  describe('refreshRemoteConfig', () => {
    it('calls revalidateTag with remote-config tag', async () => {
      const { revalidateTag } = jest.requireMock('next/cache');
      mockGetTemplate.mockResolvedValue({ parameters: {} });

      await refreshRemoteConfig();

      expect(revalidateTag).toHaveBeenCalledWith('remote-config', 'max');
    });
  });
});
