/**
 * @jest-environment node
 */

import {
  getRemoteConfigValuesForUser,
  refreshRemoteConfig,
} from './remote-config.server';
import { defaultRemoteConfigValues } from '../app/interface/RemoteConfig';

jest.mock('server-only', () => ({}));
jest.mock('react', () => ({
  cache: (fn: unknown) => fn,
}));

const mockGetTemplate = jest.fn();

jest.mock('firebase-admin/remote-config', () => ({
  getRemoteConfig: jest.fn(() => ({ getTemplate: mockGetTemplate })),
}));

jest.mock('../app/utils/config', () => ({
  getEnvConfig: jest.fn().mockReturnValue(''),
}));

const mockIsMobilityDatabaseAdmin = jest.fn();

jest.mock('../app/utils/auth-server', () => ({
  isMobilityDatabaseAdmin: (...args: unknown[]) =>
    mockIsMobilityDatabaseAdmin(...args),
}));

jest.mock('./firebase-admin', () => ({
  getFirebaseAdminApp: jest.fn().mockReturnValue({}),
}));

describe('remote-config.server', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getRemoteConfigValuesForUser', () => {
    it('returns base config for non-mobilitydata.org user in production', async () => {
      process.env.VERCEL_ENV = 'production';
      mockIsMobilityDatabaseAdmin.mockReturnValue(false);
      mockGetTemplate.mockResolvedValue({ parameters: {} });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser('user@example.com');

      expect(mockIsMobilityDatabaseAdmin).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(result.enableMetrics).toBe(
        defaultRemoteConfigValues.enableMetrics,
      );
      expect(result.enableLanguageToggle).toBe(
        defaultRemoteConfigValues.enableLanguageToggle,
      );
    });

    it('returns config with all boolean flags true for @mobilitydata.org user in production', async () => {
      process.env.VERCEL_ENV = 'production';
      mockIsMobilityDatabaseAdmin.mockReturnValue(true);
      mockGetTemplate.mockResolvedValue({
        parameters: {
          enableMetrics: { defaultValue: { value: 'false' } },
          enableLanguageToggle: { defaultValue: { value: 'false' } },
        },
      });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser(
        'engineer@mobilitydata.org',
      );

      expect(mockIsMobilityDatabaseAdmin).toHaveBeenCalledWith(
        'engineer@mobilitydata.org',
      );
      expect(result.enableMetrics).toBe(true);
      expect(result.enableLanguageToggle).toBe(true);
      expect(result.enableFeedStatusBadge).toBe(true);
      expect(result.enableDetailedCoveredArea).toBe(true);
      expect(result.gbfsValidator).toBe(true);
    });

    it('does not apply bypass for @mobilitydata.org user outside production', async () => {
      process.env.VERCEL_ENV = 'preview';
      mockIsMobilityDatabaseAdmin.mockReturnValue(true);
      mockGetTemplate.mockResolvedValue({
        parameters: {
          enableMetrics: { defaultValue: { value: 'false' } },
        },
      });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser(
        'engineer@mobilitydata.org',
      );

      // In non-production environments, bypass is NOT applied
      expect(result.enableMetrics).toBe(false);
    });

    it('returns base config for undefined email in production', async () => {
      process.env.VERCEL_ENV = 'production';
      mockIsMobilityDatabaseAdmin.mockReturnValue(false);
      mockGetTemplate.mockResolvedValue({ parameters: {} });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser(undefined);

      expect(mockIsMobilityDatabaseAdmin).toHaveBeenCalledWith(undefined);
      expect(result.enableMetrics).toBe(
        defaultRemoteConfigValues.enableMetrics,
      );
    });

    it('preserves non-boolean config values when applying bypass', async () => {
      process.env.VERCEL_ENV = 'production';
      mockIsMobilityDatabaseAdmin.mockReturnValue(true);
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
        },
      });
      await refreshRemoteConfig();

      const result = await getRemoteConfigValuesForUser(
        'engineer@mobilitydata.org',
      );

      // Non-boolean values should be preserved from remote config
      expect(result.gtfsMetricsBucketEndpoint).toBe(
        'https://storage.googleapis.com/custom-gtfs-bucket',
      );
      expect(result.visualizationMapFullDataLimit).toBe(10);
      // Boolean values should be overridden to true
      expect(result.enableMetrics).toBe(true);
    });
  });
});
