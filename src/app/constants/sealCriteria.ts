import { type SvgIconComponent } from '@mui/icons-material';
import VerifiedIcon from '@mui/icons-material/Verified';
import CodeIcon from '@mui/icons-material/Code';
import DownloadIcon from '@mui/icons-material/Download';
import RuleIcon from '@mui/icons-material/Rule';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import { type components } from '../services/feeds/types';

export type SealCriterionKey =
  | 'official'
  | 'stable'
  | 'available'
  | 'compliant'
  | 'freshRolling'
  | 'freshContinuous';

export interface SealCriterionResult {
  key: SealCriterionKey;
  icon: SvgIconComponent;
  passed: boolean;
}

// Per-criterion verdicts aren't exposed by the API yet (only the overall
// has_seal flag is) - hardcoded until GET /v1/gtfs_feeds/{id}/reliability
// is wired up on the frontend.
export const HARDCODED_SEAL_CRITERIA: SealCriterionResult[] = [
  { key: 'official', icon: VerifiedIcon, passed: true },
  { key: 'stable', icon: CodeIcon, passed: true },
  { key: 'available', icon: DownloadIcon, passed: true },
  { key: 'compliant', icon: RuleIcon, passed: true },
  { key: 'freshRolling', icon: EventAvailableIcon, passed: true },
  { key: 'freshContinuous', icon: SyncAltIcon, passed: false },
];

export type ApiSealCriterionKey =
  components['schemas']['ReliabilityCriterion']['criterion'];

// The API's criterion enum uses snake_case names that don't line up 1:1
// with the frontend's camelCase keys (fresh_coverage -> freshRolling).
export const API_CRITERION_TO_KEY: Record<
  ApiSealCriterionKey,
  SealCriterionKey
> = {
  official: 'official',
  stable: 'stable',
  available: 'available',
  compliant: 'compliant',
  fresh_coverage: 'freshRolling',
  fresh_continuous: 'freshContinuous',
};

export const SEAL_CRITERION_ICONS: Record<SealCriterionKey, SvgIconComponent> =
  {
    official: VerifiedIcon,
    stable: CodeIcon,
    available: DownloadIcon,
    compliant: RuleIcon,
    freshRolling: EventAvailableIcon,
    freshContinuous: SyncAltIcon,
  };
