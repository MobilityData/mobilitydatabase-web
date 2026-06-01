import { NextResponse, type NextRequest } from 'next/server';
import type { GbfsProxyRequest } from '../../services/gbfs/gbfs-feed-types';

/**
 * GBFS Proxy API Route
 * Fetches GBFS feed data server-side to avoid CORS issues.
 * Supports auth pass-through (Basic, Bearer, OAuth 2.0 Client Credentials).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: GbfsProxyRequest;
  try {
    body = (await request.json()) as GbfsProxyRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, auth } = body;

  if (typeof url !== 'string' || url.trim() === '') {
    return NextResponse.json(
      { error: 'Missing or invalid "url" field' },
      { status: 400 },
    );
  }

  // Security: validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Block non-HTTP(S) protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: 'Only HTTP(S) URLs are allowed' },
      { status: 400 },
    );
  }

  // SSRF prevention: block private/loopback IPs
  const hostname = parsedUrl.hostname;
  if (isPrivateHostname(hostname)) {
    return NextResponse.json(
      { error: 'URLs targeting private/internal networks are not allowed' },
      { status: 403 },
    );
  }

  // Build auth headers
  let authHeaders: Record<string, string> = {};
  if (auth != null) {
    try {
      authHeaders = await buildProxyAuthHeaders(auth);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Auth error: ${err instanceof Error ? err.message : 'Unknown'}`,
        },
        { status: 400 },
      );
    }
  }

  // Fetch the GBFS feed
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MobilityDatabase-GBFSVisualizer/1.0',
        ...authHeaders,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Upstream returned ${response.status}: ${response.statusText}`,
        },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch GBFS feed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// ─── Auth Helpers ────────────────────────────────────────────────────────────

async function buildProxyAuthHeaders(
  auth: NonNullable<GbfsProxyRequest['auth']>,
): Promise<Record<string, string>> {
  switch (auth.type) {
    case 'basic': {
      const username = auth.username ?? '';
      const password = auth.password ?? '';
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }
    case 'bearer': {
      if (auth.token == null || auth.token.trim() === '') {
        throw new Error('Bearer token is required');
      }
      return { Authorization: `Bearer ${auth.token}` };
    }
    case 'oauth': {
      if (
        auth.clientId == null ||
        auth.clientSecret == null ||
        auth.tokenUrl == null
      ) {
        throw new Error('OAuth requires clientId, clientSecret, and tokenUrl');
      }

      // Validate token URL too
      let tokenParsedUrl: URL;
      try {
        tokenParsedUrl = new URL(auth.tokenUrl);
      } catch {
        throw new Error('Invalid OAuth token URL');
      }
      if (!['http:', 'https:'].includes(tokenParsedUrl.protocol)) {
        throw new Error('OAuth token URL must use HTTP(S)');
      }
      if (isPrivateHostname(tokenParsedUrl.hostname)) {
        throw new Error('OAuth token URL cannot target private networks');
      }

      const tokenResp = await fetch(auth.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${auth.clientId}:${auth.clientSecret}`,
          ).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenResp.ok) {
        throw new Error(`OAuth token request failed: ${tokenResp.status}`);
      }

      const tokenData = (await tokenResp.json()) as {
        access_token?: string;
      };
      if (tokenData.access_token == null) {
        throw new Error('OAuth token response missing access_token');
      }

      return { Authorization: `Bearer ${tokenData.access_token}` };
    }
    default:
      return {};
  }
}

// ─── Security Helpers ────────────────────────────────────────────────────────

function isPrivateHostname(hostname: string): boolean {
  // Loopback
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    return true;
  }

  // Private IPv4 ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !Number.isNaN(p))) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts.every((p) => p === 0)) return true;
  }

  // Metadata endpoints (cloud providers)
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal'
  ) {
    return true;
  }

  return false;
}
