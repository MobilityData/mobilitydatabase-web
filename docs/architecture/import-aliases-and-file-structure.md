# Import Aliases & File Structure Architecture

## Overview
In accordance with [Issue #195](https://github.com/MobilityData/mobilitydatabase-web/issues/195), path aliases have been configured to eliminate deep, brittle relative path traversal (e.g. `../../../../../../../screens/Feed/Feed.functions`).

## Path Aliases Configured

In `tsconfig.json` and `jest.config.ts`:

- `@/*`: Points to `./src/*` for top-level source modules.
- `@mdb/*`: Points to `./src/app/*` for application modules, components, screens, services, and utilities.

### Comparison Example

#### Before (Brittle Relative Paths)
```typescript
import { formatProvidersSorted } from '../../../../../../../screens/Feed/Feed.functions';
import { displayFormattedDate } from '../../../../../../../utils/date';
import SectionContainer from '../../../../../../../components/SectionContainer';
import FeedReliabilityView from '../../../../../../screens/Feed/components/FeedReliabilityView';
```

#### After (Clean Module Aliases)
```typescript
import { formatProvidersSorted } from '@mdb/screens/Feed/Feed.functions';
import { displayFormattedDate } from '@mdb/utils/date';
import SectionContainer from '@mdb/components/SectionContainer';
import FeedReliabilityView from '@mdb/screens/Feed/components/FeedReliabilityView';
```

## Component Colocation Guidelines
- **Page-specific components:** Placed within the feature route folder (e.g. `src/app/[locale]/feeds/[feedDataType]/[feedId]/components/`).
- **Domain screen components:** Placed in the screen module (e.g. `src/app/screens/Feed/components/`).
- **Global cross-cutting components:** Placed at `@mdb/components/` (e.g. `Header`, `Footer`, `SectionContainer`, `SealOfReliability`).
- **Services and API types:** Placed at `@mdb/services/` for consistent client/server data fetching.
