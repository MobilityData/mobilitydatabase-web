import { type ComponentType } from 'react';
import { type SvgIconProps } from '@mui/material/SvgIcon';
import ForumIcon from '@mui/icons-material/Forum';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { type DateRange } from './timeline';

export interface MethodologyEntry {
  titleKey: string;
  descriptionKey: string;
  icon: ComponentType<SvgIconProps>;
}

export const methodologyEntries: MethodologyEntry[] = [
  {
    titleKey: 'methodology.consultation.title',
    descriptionKey: 'methodology.consultation.description',
    icon: ForumIcon,
  },
  {
    titleKey: 'methodology.realWorldData.title',
    descriptionKey: 'methodology.realWorldData.description',
    icon: QueryStatsIcon,
  },
  {
    titleKey: 'methodology.bestPractices.title',
    descriptionKey: 'methodology.bestPractices.description',
    icon: MenuBookIcon,
  },
];

/** Reference date the diagrams are drawn around. */
const FETCH_DATE = '2026-08-06';

export interface RollingCoverageExample {
  id: string;
  passes: boolean;
  fetchDate: string;
  lastServiceDate: string;
  /** Earliest last-service date that still satisfies the criterion. */
  minimumServiceDate: string;
  axis: DateRange;
}

export const rollingCoverageExamples: RollingCoverageExample[] = [
  {
    id: 'pass',
    passes: true,
    fetchDate: FETCH_DATE,
    lastServiceDate: '2026-08-20',
    minimumServiceDate: '2026-08-13',
    axis: { start: FETCH_DATE, end: '2026-08-27' },
  },
  {
    id: 'fail',
    passes: false,
    fetchDate: FETCH_DATE,
    lastServiceDate: '2026-08-10',
    minimumServiceDate: '2026-08-13',
    axis: { start: FETCH_DATE, end: '2026-08-27' },
  },
];

export interface FeedInfoComparisonEntry {
  titleKey: string;
  itemsKey: string;
}

export const feedInfoComparisonEntries: FeedInfoComparisonEntry[] = [
  {
    titleKey: 'freshContinuous.feedInfo.without.title',
    itemsKey: 'freshContinuous.feedInfo.without.items',
  },
  {
    titleKey: 'freshContinuous.feedInfo.with.title',
    itemsKey: 'freshContinuous.feedInfo.with.items',
  },
];

export interface ContinuousRuleEntry {
  titleKey: string;
  descriptionKey: string;
}

export const continuousRuleEntries: ContinuousRuleEntry[] = [
  {
    titleKey: 'freshContinuous.rules.noGaps.title',
    descriptionKey: 'freshContinuous.rules.noGaps.description',
  },
  {
    titleKey: 'freshContinuous.rules.serviceWindow.title',
    descriptionKey: 'freshContinuous.rules.serviceWindow.description',
  },
];

export interface ScenarioDataset extends DateRange {
  labelKey: string;
}

export interface ScenarioEntry {
  id: string;
  passes: boolean;
  axis: DateRange;
  /** Service dates declared by calendar.txt / calendar_dates.txt. */
  calendarDatasets: ScenarioDataset[];
  /** Ranges declared in feed_info.txt, when the file is present. */
  declaredRanges?: DateRange[];
  /** Axis ticks, positioned by date and labelled from the messages file. */
  axisTicks: Array<{ date: string; labelKey: string }>;
}

const SCENARIO_AXIS: DateRange = { start: '2026-01-01', end: '2026-08-14' };

const CONTINUOUS_TICKS = [
  { date: '2026-01-01', labelKey: 'freshContinuous.scenarios.ticks.jan01' },
  { date: '2026-04-15', labelKey: 'freshContinuous.scenarios.ticks.apr15' },
  { date: '2026-07-20', labelKey: 'freshContinuous.scenarios.ticks.jul20' },
  { date: '2026-08-14', labelKey: 'freshContinuous.scenarios.ticks.aug14' },
];

const GAPPED_TICKS = [
  { date: '2026-01-01', labelKey: 'freshContinuous.scenarios.ticks.jan01' },
  { date: '2026-04-14', labelKey: 'freshContinuous.scenarios.ticks.apr14' },
  { date: '2026-05-15', labelKey: 'freshContinuous.scenarios.ticks.may15' },
  { date: '2026-08-14', labelKey: 'freshContinuous.scenarios.ticks.aug14' },
];

/**
 * The feed_info.txt scenarios start on Jan 15, so they get their own axis —
 * otherwise their bars would begin part-way along the track.
 */
const DECLARED_AXIS: DateRange = { start: '2026-01-15', end: '2026-08-14' };

const DECLARED_TICKS = [
  { date: '2026-01-15', labelKey: 'freshContinuous.scenarios.ticks.jan15' },
  { date: '2026-04-14', labelKey: 'freshContinuous.scenarios.ticks.apr14' },
  { date: '2026-05-15', labelKey: 'freshContinuous.scenarios.ticks.may15' },
  { date: '2026-08-14', labelKey: 'freshContinuous.scenarios.ticks.aug14' },
];

export const scenarioEntries: ScenarioEntry[] = [
  {
    id: 'continuous',
    passes: true,
    axis: SCENARIO_AXIS,
    calendarDatasets: [
      {
        start: '2026-01-01',
        end: '2026-04-14',
        labelKey: 'freshContinuous.scenarios.versions.v1',
      },
      {
        start: '2026-04-15',
        end: '2026-07-19',
        labelKey: 'freshContinuous.scenarios.versions.v2',
      },
      {
        start: '2026-07-20',
        end: '2026-08-14',
        labelKey: 'freshContinuous.scenarios.versions.v3',
      },
    ],
    axisTicks: CONTINUOUS_TICKS,
  },
  {
    id: 'gap',
    passes: false,
    axis: SCENARIO_AXIS,
    calendarDatasets: [
      {
        start: '2026-01-01',
        end: '2026-04-14',
        labelKey: 'freshContinuous.scenarios.versions.v1',
      },
      {
        start: '2026-05-15',
        end: '2026-07-19',
        labelKey: 'freshContinuous.scenarios.versions.v2',
      },
      {
        start: '2026-07-20',
        end: '2026-08-14',
        labelKey: 'freshContinuous.scenarios.versions.v3',
      },
    ],
    axisTicks: GAPPED_TICKS,
  },
  {
    id: 'declaredContinuous',
    passes: true,
    axis: DECLARED_AXIS,
    calendarDatasets: [
      {
        start: '2026-01-15',
        end: '2026-04-14',
        labelKey: 'freshContinuous.scenarios.versions.v1',
      },
      {
        start: '2026-05-15',
        end: '2026-07-19',
        labelKey: 'freshContinuous.scenarios.versions.v2',
      },
      {
        start: '2026-07-20',
        end: '2026-08-14',
        labelKey: 'freshContinuous.scenarios.versions.v3',
      },
    ],
    declaredRanges: [{ start: '2026-01-15', end: '2026-08-14' }],
    axisTicks: DECLARED_TICKS,
  },
  {
    id: 'declaredGap',
    passes: false,
    axis: DECLARED_AXIS,
    calendarDatasets: [
      {
        start: '2026-01-15',
        end: '2026-04-14',
        labelKey: 'freshContinuous.scenarios.versions.v1',
      },
      {
        start: '2026-05-15',
        end: '2026-07-19',
        labelKey: 'freshContinuous.scenarios.versions.v2',
      },
      {
        start: '2026-07-20',
        end: '2026-08-14',
        labelKey: 'freshContinuous.scenarios.versions.v3',
      },
    ],
    declaredRanges: [
      { start: '2026-01-15', end: '2026-04-14' },
      { start: '2026-05-15', end: '2026-08-14' },
    ],
    axisTicks: DECLARED_TICKS,
  },
];

/** Rendered as a Stepper, so the step number replaces an explicit phase label. */
export interface EarningPhaseEntry {
  titleKey: string;
  descriptionKey: string;
}

export const earningPhaseEntries: EarningPhaseEntry[] = [
  {
    titleKey: 'earning.phases.added.title',
    descriptionKey: 'earning.phases.added.description',
  },
  {
    titleKey: 'earning.phases.window.title',
    descriptionKey: 'earning.phases.window.description',
  },
  {
    titleKey: 'earning.phases.earned.title',
    descriptionKey: 'earning.phases.earned.description',
  },
];

export interface ClockStartEntry {
  criterionKey: string;
  descriptionKey: string;
}

export const clockStartEntries: ClockStartEntry[] = [
  {
    criterionKey: 'earning.clock.stable.criterion',
    descriptionKey: 'earning.clock.stable.description',
  },
  {
    criterionKey: 'earning.clock.available.criterion',
    descriptionKey: 'earning.clock.available.description',
  },
  {
    criterionKey: 'earning.clock.compliant.criterion',
    descriptionKey: 'earning.clock.compliant.description',
  },
  {
    criterionKey: 'earning.clock.freshRolling.criterion',
    descriptionKey: 'earning.clock.freshRolling.description',
  },
  {
    criterionKey: 'earning.clock.freshContinuous.criterion',
    descriptionKey: 'earning.clock.freshContinuous.description',
  },
];

export const GTFS_VALIDATOR_URL = 'https://gtfs-validator.mobilitydata.org/';
