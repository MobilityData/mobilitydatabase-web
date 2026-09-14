import { type ComponentType } from 'react';
import { type SvgIconProps } from '@mui/material/SvgIcon';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import StorefrontIcon from '@mui/icons-material/Storefront';
import GavelIcon from '@mui/icons-material/Gavel';
import {
  type SealCriterionKey,
  SEAL_CRITERION_ICONS,
} from '../../../constants/sealCriteria';

export interface HeroContent {
  titleKey: string;
  paragraphsKey: string;
  ctaButtonKey: string;
}

export const heroContent: HeroContent = {
  titleKey: 'hero.title',
  paragraphsKey: 'hero.paragraphs',
  ctaButtonKey: 'hero.ctaButton',
};

export interface BenefitEntry {
  titleKey: string;
  icon: ComponentType<SvgIconProps>;
  itemsKey: string;
}

export const benefitEntries: BenefitEntry[] = [
  {
    titleKey: 'benefits.agencies.title',
    icon: DirectionsBusIcon,
    itemsKey: 'benefits.agencies.items',
  },
  {
    titleKey: 'benefits.applications.title',
    icon: PhoneAndroidIcon,
    itemsKey: 'benefits.applications.items',
  },
  {
    titleKey: 'benefits.vendors.title',
    icon: StorefrontIcon,
    itemsKey: 'benefits.vendors.items',
  },
  {
    titleKey: 'benefits.regulators.title',
    icon: GavelIcon,
    itemsKey: 'benefits.regulators.items',
  },
];

export interface CriteriaEntry {
  key: SealCriterionKey;
  titleKey: string;
  subtitleKey: string;
  descriptionKey: string;
  icon: ComponentType<SvgIconProps>;
}

export const criteriaEntries: CriteriaEntry[] = [
  {
    key: 'official',
    titleKey: 'criteria.official.title',
    subtitleKey: 'criteria.official.subtitle',
    descriptionKey: 'criteria.official.description',
    icon: SEAL_CRITERION_ICONS.official,
  },
  {
    key: 'stable',
    titleKey: 'criteria.stable.title',
    subtitleKey: 'criteria.stable.subtitle',
    descriptionKey: 'criteria.stable.description',
    icon: SEAL_CRITERION_ICONS.stable,
  },
  {
    key: 'available',
    titleKey: 'criteria.available.title',
    subtitleKey: 'criteria.available.subtitle',
    descriptionKey: 'criteria.available.description',
    icon: SEAL_CRITERION_ICONS.available,
  },
  {
    key: 'compliant',
    titleKey: 'criteria.compliant.title',
    subtitleKey: 'criteria.compliant.subtitle',
    descriptionKey: 'criteria.compliant.description',
    icon: SEAL_CRITERION_ICONS.compliant,
  },
  {
    key: 'freshRolling',
    titleKey: 'criteria.freshRolling.title',
    subtitleKey: 'criteria.freshRolling.subtitle',
    descriptionKey: 'criteria.freshRolling.description',
    icon: SEAL_CRITERION_ICONS.freshRolling,
  },
  {
    key: 'freshContinuous',
    titleKey: 'criteria.freshContinuous.title',
    subtitleKey: 'criteria.freshContinuous.subtitle',
    descriptionKey: 'criteria.freshContinuous.description',
    icon: SEAL_CRITERION_ICONS.freshContinuous,
  },
];

export interface GracePeriodEntry {
  criterionKey: string;
  triggerConditionKey: string;
  gracePeriodKey: string;
  consequenceKey: string;
}

export const gracePeriodEntries: GracePeriodEntry[] = [
  {
    criterionKey: 'gracePeriods.compliant.criterion',
    triggerConditionKey: 'gracePeriods.compliant.triggerCondition',
    gracePeriodKey: 'gracePeriods.compliant.gracePeriod',
    consequenceKey: 'gracePeriods.compliant.consequence',
  },
  {
    criterionKey: 'gracePeriods.available.criterion',
    triggerConditionKey: 'gracePeriods.available.triggerCondition',
    gracePeriodKey: 'gracePeriods.available.gracePeriod',
    consequenceKey: 'gracePeriods.available.consequence',
  },
  {
    criterionKey: 'gracePeriods.freshCoverage.criterion',
    triggerConditionKey: 'gracePeriods.freshCoverage.triggerCondition',
    gracePeriodKey: 'gracePeriods.freshCoverage.gracePeriod',
    consequenceKey: 'gracePeriods.freshCoverage.consequence',
  },
];

export interface FaqEntry {
  questionKey: string;
  answerKey: string;
}

export const faqEntries: FaqEntry[] = [
  { questionKey: 'faq.coverage.question', answerKey: 'faq.coverage.answer' },
  {
    questionKey: 'faq.definition.question',
    answerKey: 'faq.definition.answer',
  },
  {
    questionKey: 'faq.agencyOrVendor.question',
    answerKey: 'faq.agencyOrVendor.answer',
  },
  {
    questionKey: 'faq.riskAwareness.question',
    answerKey: 'faq.riskAwareness.answer',
  },
];
