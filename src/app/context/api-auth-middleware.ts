import type { Middleware } from 'openapi-fetch';

/**
 * Internal header used to propagate end-user context from the web app
 * to backend services. The value is expected to be a compact JWT that
 * the backend (Python) can verify and decode.
 */
export const USER_CONTEXT_HEADER = 'x-mdb-user-context';

/**
 * Builds an OpenAPI client middleware that attaches both the GCIP/IAP
 * access token and, optionally, a user-context JWT header to outgoing
 * requests.
 *
 * This helper lives outside the generated API client so that future
 * OpenAPI-generated services can all share the same auth wiring.
 *
 * - `accessToken` is the IAP/GCIP token used for Authorization.
 * - `userContextJwt`, when provided, is a server-signed JWT carrying
 *   minimal user identity (uid/email/isGuest, etc.) that the Python
 *   service can decode.
 */
export const generateAuthMiddlewareWithToken = (
  accessToken: string,
  userContextJwt?: string,
): Middleware => {
  return {
    async onRequest(req) {
      // Always attach the bearer token for IAP/GCIP.
      req.headers.set('Authorization', `Bearer ${accessToken}`);

      // When available (typically in server-side code), also attach a
      // compact user-context JWT so the backend can attribute calls to
      // an end-user without relying on IAP to forward custom claims.
      if (userContextJwt != null && userContextJwt !== '') {
        req.headers.set(USER_CONTEXT_HEADER, userContextJwt);
      }

      return req;
    },
  };
};
