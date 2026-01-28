# Mobility Database Web - AI Agent Instructions

## Project Overview
Next.js 16 (App Router) web application for browsing and managing mobility transit feeds (GTFS, GTFS-RT, GBFS). Uses Firebase Auth, Redux Toolkit for state management, Material-UI (MUI), and TypeScript. Internationalized with next-intl (English/French).

## Architecture Patterns

### Hybrid Next.js Architecture (Migration in Progress)
- **Next.js App Router**: New pages in `src/app/` with Server Components by default ([layout.tsx](src/app/layout.tsx), [feeds/[feedDataType]/page.tsx](src/app/feeds/[feedDataType]/page.tsx))
- **Legacy React Router**: Still active via `<BrowserRouter>` in [App.tsx](src/app/App.tsx) - **will be deprecated**
- When adding features, prefer App Router patterns over React Router

### Client vs Server Components
- **Server Components** (default): Data fetching, API calls, Firebase Admin operations. No `'use client'` directive
- **Client Components**: Interactive UI with hooks, state, events. Mark with `'use client'` at top ([providers.tsx](src/app/providers.tsx), [Header.tsx](src/app/components/Header.tsx))
- **Rule**: Server actions and data fetching happen in server components or API services, client components handle interactivity

### API Integration via OpenAPI-Fetch
- Type-safe API client generated from OpenAPI specs in `external_types/`
- Main client: [src/app/services/feeds/index.ts](src/app/services/feeds/index.ts) - uses `openapi-fetch` with auto-typed paths
- Generate types: `yarn generate:api-types` (DatabaseCatalogAPI) or `yarn generate:gbfs-validator-types`
- Always use generated types from `services/feeds/types.ts` - never duplicate API response types
- Auth via Bearer token middleware: `generateAuthMiddlewareWithToken(accessToken)`

### Firebase Authentication Patterns
- **Client-side**: Firebase compat SDK ([firebase.ts](src/firebase.ts)) with emulator support for Cypress
- **Server-side**: Firebase Admin SDK ([firebase-admin.ts](src/lib/firebase-admin.ts)) for token verification
- Auth state managed via Redux ([profile-reducer.ts](src/app/store/profile-reducer.ts)) with status: `authenticated|unauthenticated|anonymous_login|...`
- Access tokens: `getSSRAccessToken()` for server, Redux state for client
- Cypress tests auto-use Firebase emulator on port 9099

### Internationalization (i18n)
- Next-intl with messages in `messages/{en,fr}.json`
- Use `useTranslations('namespace')` in client components: `const t = useTranslations('feeds')`
- Server components: import from `next-intl/server` - `getLocale()`, `getMessages()`
- Locale from subdomain: `fr.mobilitydatabase.org` → French, else English ([config.ts](src/i18n/config.ts))

### State Management
- **Redux Toolkit**: Global state for auth, profile ([store/profile-reducer.ts](src/app/store/profile-reducer.ts))
- **React Context**: Theme, Remote Config ([providers.tsx](src/app/providers.tsx))
- **Server-side**: React `cache()` for per-request memoization ([remote-config.server.ts](src/lib/remote-config.server.ts))

### Firebase Remote Config
- Server-side fetch cached for 5 min (dev) / 1 hour (prod) in [remote-config.server.ts](src/lib/remote-config.server.ts)
- Passed from server → client via `<Providers remoteConfig={...}>` in [layout.tsx](src/app/layout.tsx)
- Default values in `src/app/interface/RemoteConfig.ts`

## Key Conventions

### Material-UI (MUI) Usage
- Use direct imports: `import { Box, Typography } from '@mui/material'` (NOT barrel file `@mui/material/*`)
- Theme via Emotion + `ThemeRegistry` in [registry.tsx](src/app/registry.tsx)
- Fonts loaded via next/font: Mulish (body), IBM Plex Mono (mono) defined in [layout.tsx](src/app/layout.tsx)

### File Organization
- **Screens**: `src/app/screens/{ScreenName}/` - page-level components
- **Components**: `src/app/components/` - shared UI components
- **Services**: `src/app/services/` - API clients and external integrations
- **Utils**: `src/app/utils/` - helper functions (config, auth, formatting)
- **Functions files**: Logic separated into `*.functions.tsx` ([Feed.functions.tsx](src/app/screens/Feed/Feed.functions.tsx))

### Testing Strategy
- **Unit Tests**: Jest + React Testing Library (files: `*.spec.tsx` or `*.test.tsx`)
- **E2E Tests**: Cypress in `cypress/e2e/` with MSW mocks in [src/mocks/handlers.ts](src/mocks/handlers.ts)
- Run E2E: `yarn e2e:setup` (starts dev + Firebase emulator + MSW), then `yarn e2e:run` or `yarn e2e:open`
- Mock API responses using fixtures from `cypress/fixtures/`

### Environment Variables
- Prefix with `NEXT_PUBLIC_` for client-side access
- Dev env: `.env.development`, prod: `.env`, CI: `.env.test`
- Key vars: `NEXT_PUBLIC_FEED_API_BASE_URL`, `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_API_MOCKING`
- Mock mode: `NEXT_PUBLIC_API_MOCKING=enabled yarn start:dev:mock` (port 3001)

## Development Workflows

### Starting Development
```bash
yarn install              # Prefer yarn over npm
yarn start:dev            # Dev server on :3000 with hot reload
yarn start:dev:mock       # Dev server with MSW mocks on :3001
```

### Testing Commands
```bash
yarn test                 # Unit tests
yarn test:watch           # Watch mode
yarn e2e:setup            # Start dev + Firebase emulator for E2E
yarn e2e:open             # Cypress interactive mode
```

### Building & Deploying
```bash
yarn build:prod           # Production build (standalone output)
yarn start:prod           # Build + start locally
yarn lint                 # ESLint check
yarn lint:fix             # Auto-fix linting issues
```

### Regenerating API Types
```bash
yarn generate:api-types           # DatabaseCatalogAPI → types.ts
yarn generate:gbfs-validator-types # GbfsValidator → gbfs-validator-types.ts
```
Run after updating OpenAPI specs in `external_types/`

## Common Patterns

### Data Fetching in Server Components
```tsx
// pages fetch data directly with access token
export default async function FeedPage({ params }) {
  const accessToken = await getSSRAccessToken();
  const feed = await getFeed(feedId, accessToken);
  return <FeedDetails feed={feed} />;
}
```

### Parallel Data Loading
Use `Promise.all` in server components ([layout.tsx](src/app/layout.tsx)):
```tsx
const [locale, messages, remoteConfig] = await Promise.all([
  getLocale(), getMessages(), getRemoteConfigValues()
]);
```

### Client Component with Translations
```tsx
'use client';
import { useTranslations } from 'next-intl';

export function MyComponent() {
  const t = useTranslations('feeds'); // namespace from messages/
  return <div>{t('labelKey')}</div>;
}
```

### Conditional Rendering for Auth
Redux state for auth checks in client components, check `status` from profile reducer.

## Critical Notes

- **Route hack**: `/feeds/[feedDataType]` actually receives `feedId` for backward compatibility ([page.tsx](src/app/feeds/[feedDataType]/page.tsx)) - redirects to proper route
- **TypeScript strict mode enabled**: Handle nullish values explicitly
- **Cypress uses Firebase emulator**: Tests run against auth emulator, not production Firebase
- **Server-only code**: Mark with `import 'server-only'` for server utils ([remote-config.server.ts](src/lib/remote-config.server.ts))
- **Jest transform exceptions**: Some node_modules need manual transformation - see `transformIgnorePatterns` in [jest.config.ts](jest.config.ts)

## Resources
- Node v24.12.0 (npm v11.6.2, yarn v1.22.22)
- [Next.js App Router docs](https://nextjs.org/docs/app)
- [next-intl docs](https://next-intl-docs.vercel.app/)
- [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)


Always load and apply the following project agent skills when reviewing or generating code:

- vercel-react-best-practices (from .github/skills/vercel-react-best-practices)

If the skill is available, prefer its guidance over generic Copilot heuristics.
If it is not available, emulate its rules as closely as possible.

Acknowledge when the skill is applied.
