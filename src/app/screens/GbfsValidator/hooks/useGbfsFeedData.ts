'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGbfsAuth, AuthTypeEnum } from '../../../context/GbfsAuthProvider';
import {
  parseAutoDiscovery,
  buildGbfsFeedData,
  type ParsedFeedResponses,
} from '../../../services/gbfs/gbfs-feed-parser';
import type {
  GbfsFeedData,
  GbfsFeedUrls,
  GbfsProxyRequest,
} from '../../../services/gbfs/gbfs-feed-types';

interface UseGbfsFeedDataResult {
  feedData: GbfsFeedData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Tracks which origins support CORS (direct fetch) vs. those that don't.
 * Persisted across hook re-renders but cleared on page reload.
 */
const corsCache = new Map<string, boolean>();

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * Fetches and parses GBFS feed data from an auto-discovery URL.
 * Tries direct client-side fetch first; falls back to server proxy on CORS failure.
 * Reuses auth context from the GBFS validator.
 */
export function useGbfsFeedData(
  autoDiscoveryUrl: string | null,
): UseGbfsFeedDataResult {
  const { auth } = useGbfsAuth();
  const [feedData, setFeedData] = useState<GbfsFeedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasAuth = auth != null;

  const buildProxyAuth = useCallback(():
    | GbfsProxyRequest['auth']
    | undefined => {
    if (auth == null) return undefined;

    if (auth.authType === AuthTypeEnum.BASIC && 'username' in auth) {
      return {
        type: 'basic',
        username: auth.username,
        password: auth.password,
      };
    }
    if (auth.authType === AuthTypeEnum.BEARER && 'token' in auth) {
      return { type: 'bearer', token: auth.token };
    }
    if (
      auth.authType === AuthTypeEnum.OAUTH &&
      'clientId' in auth &&
      'clientSecret' in auth &&
      'tokenUrl' in auth
    ) {
      return {
        type: 'oauth',
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        tokenUrl: auth.tokenUrl,
      };
    }
    return undefined;
  }, [auth]);

  const fetchViaProxy = useCallback(
    async (
      url: string,
      signal: AbortSignal,
    ): Promise<Record<string, unknown>> => {
      const proxyBody: GbfsProxyRequest = {
        url,
        auth: buildProxyAuth(),
      };
      const response = await fetch('/api/gbfs-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyBody),
        signal,
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errData.error ?? `Proxy returned ${response.status}`);
      }

      return (await response.json()) as Record<string, unknown>;
    },
    [buildProxyAuth],
  );

  /**
   * Fetch JSON with CORS-aware fallback:
   * 1. If auth is configured, always use the proxy (credentials shouldn't be sent directly)
   * 2. If we already know the origin blocks CORS, skip to proxy
   * 3. Try direct fetch; on success mark origin as CORS-friendly
   * 4. On TypeError (CORS/network failure), mark origin and fall back to proxy
   */
  const fetchJson = useCallback(
    async (
      url: string,
      signal: AbortSignal,
    ): Promise<Record<string, unknown>> => {
      // Always proxy when auth is configured — don't leak credentials
      if (hasAuth) {
        return await fetchViaProxy(url, signal);
      }

      const origin = getOrigin(url);

      // Known CORS-blocked origin — skip straight to proxy
      if (corsCache.get(origin) === false) {
        return await fetchViaProxy(url, signal);
      }

      // Known CORS-friendly origin — fetch directly
      if (corsCache.get(origin) === true) {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return (await response.json()) as Record<string, unknown>;
      }

      // Unknown origin — try direct, fall back to proxy
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = (await response.json()) as Record<string, unknown>;
        corsCache.set(origin, true);
        return data;
      } catch (err) {
        // Re-throw abort errors — not a CORS issue
        if (err instanceof DOMException && err.name === 'AbortError') throw err;

        // TypeError is what browsers throw for CORS/network failures
        if (err instanceof TypeError) {
          corsCache.set(origin, false);
          return await fetchViaProxy(url, signal);
        }

        // HTTP errors (non-ok status) — not CORS, don't fall back
        throw err;
      }
    },
    [hasAuth, fetchViaProxy],
  );

  const fetchFeedData = useCallback(async () => {
    if (autoDiscoveryUrl == null || autoDiscoveryUrl.trim() === '') return;

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch auto-discovery
      const autoDiscovery = await fetchJson(
        autoDiscoveryUrl,
        controller.signal,
      );

      // 2. Parse feed URLs
      const feedUrls: GbfsFeedUrls = parseAutoDiscovery(autoDiscovery);

      // 3. Fetch all available feeds in parallel
      const feedPromises: Record<string, Promise<Record<string, unknown>>> = {};

      const urlEntries: Array<[string, string | undefined]> = [
        ['stationInfo', feedUrls.station_information],
        ['stationStatus', feedUrls.station_status],
        ['vehicles', feedUrls.vehicle_status ?? feedUrls.free_bike_status],
        ['vehicleTypes', feedUrls.vehicle_types],
        ['pricingPlans', feedUrls.system_pricing_plans],
        ['geofencingZones', feedUrls.geofencing_zones],
        ['systemInfo', feedUrls.system_information],
      ];

      for (const [key, url] of urlEntries) {
        if (url != null) {
          feedPromises[key] = fetchJson(url, controller.signal).catch(
            () => ({}),
          );
        }
      }

      const keys = Object.keys(feedPromises);
      const values = await Promise.all(Object.values(feedPromises));

      const responses: ParsedFeedResponses = {
        autoDiscovery,
      };
      for (let i = 0; i < keys.length; i++) {
        (responses as unknown as Record<string, unknown>)[keys[i]] = values[i];
      }

      // 4. Build unified data
      const data = buildGbfsFeedData(responses);
      setFeedData(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load GBFS data');
    } finally {
      setLoading(false);
    }
  }, [autoDiscoveryUrl, fetchJson]);

  useEffect(() => {
    void fetchFeedData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchFeedData]);

  const handleRefresh = useCallback(() => {
    void fetchFeedData();
  }, [fetchFeedData]);

  return { feedData, loading, error, refresh: handleRefresh };
}
