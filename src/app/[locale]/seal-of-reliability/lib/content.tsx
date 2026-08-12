import { type ComponentType } from 'react';
import { type SvgIconProps } from '@mui/material/SvgIcon';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import AppsIcon from '@mui/icons-material/Apps';
import StorefrontIcon from '@mui/icons-material/Storefront';
import GavelIcon from '@mui/icons-material/Gavel';

export interface HeroContent {
  title: string;
  paragraphs: string[];
}

export const heroContent: HeroContent = {
  title: 'The Benchmark for Reliable GTFS Schedule Data',
  paragraphs: [
    "It's hard to measure if data is trustworthy. Transit agencies struggle to know if their Glrs data works tor riders; data vendors lack a baseline bar ot quality to aspire to, and trip planning apps end up spending time pre-processing feeds rather than seamlessly consuming them",
    "That's where the MobilityData Seal of Reliability comes in. As a clear measure of baseline quality, the Seal of Reliability is applied to feeds that meet five key criteria: they're official, stable, available, compliant, and fresh.",
  ],
};

export interface BenefitEntry {
  title: string;
  icon: ComponentType<SvgIconProps>;
  items: string[];
}

export const benefitEntries: BenefitEntry[] = [
  {
    title: 'For Transit Agencies',
    icon: DirectionsBusIcon,
    items: [
      'Use the Seal definition in procurement contracts to set a clear baseline for vendor GTFS data quality',
      'Triage data quality issues using Mobility Database analytics',
      'Give riders a better experience by ensuring feeds meet a minimum reliability bar',
    ],
  },
  {
    title: 'For Applications',
    icon: AppsIcon,
    items: [
      'Quickly identify feeds that are ready to ingest without heavy pre-processing and testing',
      'Assess regional launch readiness based on how many feeds in an area have earned the Seal',
      'Reference a neutral, third-party standard when explaining data quality requirements to data producers',
    ],
  },
  {
    title: 'For Vendors',
    icon: StorefrontIcon,
    items: [
      "Evaluate prospective clients' current data quality",
      "Adjust quotes based on the anticipated level of effort to bring a feed up to the Seal's standard",
    ],
  },
  {
    title: 'For Regulators',
    icon: GavelIcon,
    items: [
      'Reference the Seal definition in policy requirements',
      'Use the Seal as a measureable, automated standard for GTFS Schedule data quality',
    ],
  },
];

export interface CriteriaEntry {
  title: string;
  subtitle: string;
  description: string;
}

export const criteriaEntries: CriteriaEntry[] = [
  {
    title: 'Official',
    subtitle: 'Authorized by the transit agency.',
    description:
      'The feed has been confirmed as an official source, published by or on behalf of the transit agency.',
  },
  {
    title: 'Stable',
    subtitle: "The download URL doesn't change",
    description:
      'For at least six uninterrupted months, the same URL serves the feed, and the URL appears to be permanent.',
  },
  {
    title: 'Available',
    subtitle: 'Can be downloaded from the URL each day.',
    description:
      'Once a day, the Mobility Database fetches the feed and downloads it cleanly.',
  },
  {
    title: 'Compliant',
    subtitle:
      'Adheres to every "must" in the General Transit Feed Specification.',
    description:
      'The feed has 0 errors in the Official GTFS Schedule Validator. Warnings and info notices do not affect compliance.',
  },
  {
    title: 'Fresh: Rolling 7 days of coverage',
    subtitle: 'Always includes 7 days or more of service coverage.',
    description:
      'Following GTFS Best Practices, the feed provides at least 7 days of rolling future service coverage. This means at least a full week of service is covered every day it is fetched.',
  },
  {
    title: 'Fresh: Continuous coverage',
    subtitle: 'A realistic service window with no gaps between feed versions.',
    description:
      'Service coverage is continuous across subsequent feed versions with no gaps, and the service window spans two years or less.',
  },
];

export interface GracePeriodEntry {
  criterion: string;
  triggerCondition: string;
  gracePeriod: string;
  consequence: string;
}

export const gracePeriodEntries: GracePeriodEntry[] = [
  {
    criterion: 'Compliant',
    triggerCondition: 'Validation error',
    gracePeriod: '30 days',
    consequence:
      'If a feed develops a validation error, producers have 30 days to fix it. After 30 days, if the errors persist, the feed loses its Seal.',
  },
  {
    criterion: 'Available',
    triggerCondition: 'Download failure',
    gracePeriod: '14 days',
    consequence:
      'If a feed cannot be downloaded, producers have 14 days to restore access. After 14 days, if the feed remains unavailable, the feed loses its Seal.',
  },
  {
    criterion: 'Fresh (7‑day coverage)',
    triggerCondition: 'Coverage gap',
    gracePeriod: '14 days',
    consequence:
      'If a feed stops covering far enough into the future, producers have 14 days to publish an update before the feed loses its Seal.',
  },
];

export interface FaqEntry {
  question: string;
  answer: string;
}

export const faqEntries: FaqEntry[] = [
  {
    question: 'What does the Seal cover?',
    answer:
      'The Seal evaluates GTFS Schedule feeds only. It does not cover GTFS Realtime or GBFS data. We focused on GTFS Schedule given the established state of the GTFS Schedule Validator and our existing processing pipeline for this data on the Mobility Database. We will explore extending the Seal to other data formats based on user feedback.',
  },
  {
    question: 'How do you define reliability?',
    answer:
      'A reliable feed is trustworthy. It is official, stable, available, compliant and fresh. We consulted a variety of consuming applications to finalize this definition and identify the most common pain points with data reliability. This does exclude other key aspects of data quality, such as accuracy relative to the real world service. These elements are more complex and require local knowledge of each transit network. Our goal for the Seal of Reliability is to define a minimum, measurable threshold that GTFS Schedule data should meet, so our scope is narrowly focused.',
  },
  {
    question: 'Can an agency or vendor earn the Seal?',
    answer:
      "No. Only a feed can earn the Seal, not an agency or a vendor. This keeps evaluation automated and consistent. An agency may have some feeds that earn the Seal and others that don't -- both outcomes will be visible on the Mobility Database.",
  },
  {
    question:
      "As a data producer, how do I know if I'm at risk of losing the Seal?",
    answer:
      "The best way is to check your feed on the Mobility Database 1-2 times a month to see your Seal status. Our team is working on email notifications, so in the future you can be notified when you've entered a grace period.",
  },
];
