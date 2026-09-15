import { type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import Typography from '@mui/material/Typography';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Components
import AboutSealButton from './AboutSealButton';
import FeedDetailHeader from './FeedDetailHeader';
import ScrollToTop from './ScrollToTop';
import SealSection from './SealSection';
import CriterionSection from './CriterionSection';
import CriterionStatusChip from './CriterionStatusChip';
import AvailabilityCriterionBody from './AvailabilityCriterionBody';
import AvailabilityUptimeChip from './AvailabilityUptimeChip';
import ComplianceCriterionBody from './ComplianceCriterionBody';
import ContinuousCoverageCriterionBody from './ContinuousCoverageCriterionBody';
import CoverageWindowChip from './CoverageWindowChip';
import FreshCoverageCriterionBody from './FreshCoverageCriterionBody';

// Utils
import { type AllFeedType } from '../../../services/feeds/utils';
import { type components } from '../../../services/feeds/types';
import { type SealAnalysisData } from '../../../[locale]/feeds/[feedDataType]/[feedId]/lib/seal-analysis-data';
import {
  getCriterionDisplayStatus,
  type SealCriterionContext,
} from '../../../constants/sealCriteria';
import { formatProvidersSorted } from '../Feed.functions';
import { buildAvailabilityCalendar } from '../lib/availability-history';
import { getCoverageWindowLength } from '../lib/continuous-coverage';
import { getLatestCoverageWindow } from '../lib/fresh-coverage';
import { displayFormattedDate } from '../../../utils/date';
import SectionContainer from '../../../components/SectionContainer';

interface Props {
  feed: AllFeedType;
  latestDataset?: components['schemas']['GtfsDataset'];
  sealAnalysis?: SealAnalysisData;
}

export default async function FeedReliabilityView({
  feed,
  latestDataset,
  sealAnalysis,
}: Props): Promise<ReactElement> {
  if (feed == undefined) notFound();
  const reliability = sealAnalysis?.reliability;
  const t = await getTranslations('feeds');
  const sortedProviders = formatProvidersSorted(feed.provider ?? '');

  // Pinned once here so every date-derived branch below resolves to the same
  // instant during SSR and hydration. This route is force-dynamic, so it is
  // request time.
  const now = new Date();
  const criterionContext: SealCriterionContext = {
    isProducerUrlUnstable: feed.source_info?.is_producer_url_unstable,
    feedCreatedAt: feed.created_at,
    now,
  };
  const producerUrl = feed.source_info?.producer_url;

  const findCriterion = (
    name: components['schemas']['ReliabilityCriterion']['criterion'],
  ): components['schemas']['ReliabilityCriterion'] | undefined =>
    reliability?.criteria?.find((c) => c.criterion === name);

  const evaluatedAt = displayFormattedDate(
    reliability?.evaluated_at ?? undefined,
  );

  const officialCriterion = findCriterion('official');
  const stableCriterion = findCriterion('stable');
  const availableCriterion = findCriterion('available');
  const compliantCriterion = findCriterion('compliant');
  const freshCoverageCriterion = findCriterion('fresh_coverage');
  const freshContinuousCriterion = findCriterion('fresh_continuous');
  
  const continuousCoverage = sealAnalysis?.continuousCoverage;
  const serviceWindow = getLatestCoverageWindow(
    continuousCoverage,
    latestDataset,
  );
  const coverageWindowLength = getCoverageWindowLength(
    continuousCoverage?.latest_state?.newer.coverage_window,
  );

  // Built once and handed down, so the header's uptime chip and the grid in
  // the body are reading the same window.
  const availabilityCalendar = buildAvailabilityCalendar(
    sealAnalysis?.availability?.checks,
    { now },
  );

  return (
    <Container
      component='main'
      sx={{ width: '100%', m: 'auto', px: 0 }}
      maxWidth='xl'
    >
      <ScrollToTop />
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <SectionContainer maxWidth='xl'>
          <Box sx={{ position: 'relative' }}>
            <FeedDetailHeader
              feed={feed}
              sortedProviders={sortedProviders}
              currentPageLabel={t('reliabilityAnalysisTitle')}
              backFallbackHref={`/feeds/${feed.data_type ?? ''}/${feed.id ?? ''}`}
            />

            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                mt: 3,
              }}
            >
              <Box>
                <Typography
                  component='h2'
                  variant='h6'
                  sx={{ fontWeight: 700 }}
                  color='secondary'
                >
                  {t('reliabilityAnalysisTitle')}
                </Typography>
                {evaluatedAt !== '' && (
                  <Typography
                    data-testid='seal-analysis-evaluated-at'
                    variant='caption'
                    color='text.secondary'
                    component='div'
                  >
                    {t('sealLastEvaluated', { date: evaluatedAt })}
                  </Typography>
                )}
              </Box>
              <AboutSealButton />
            </Box>

            <SealSection
              reliability={reliability}
              criterionContext={criterionContext}
              backgroundColor='background.default'
            />

            {(officialCriterion != undefined ||
              stableCriterion != undefined) && (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  gap: 2,
                  mt: 4,
                }}
              >
                {officialCriterion != undefined && (
                  <CriterionSection
                    criterion={officialCriterion}
                    context={criterionContext}
                    statusChip={
                      <CriterionStatusChip
                        displayStatus={getCriterionDisplayStatus(
                          officialCriterion,
                        )}
                      />
                    }
                  />
                )}
                {stableCriterion != undefined && (
                  <CriterionSection
                    criterion={stableCriterion}
                    context={criterionContext}
                    producerUrl={producerUrl}
                    statusChip={
                      <CriterionStatusChip
                        displayStatus={getCriterionDisplayStatus(
                          stableCriterion,
                        )}
                      />
                    }
                  />
                )}
              </Box>
            )}

            {/* Available, Compliant and the two Fresh criteria each carry a
                full history or a diagram, so they get a row of their own
                rather than sharing the two-up grid. */}
            {availableCriterion != undefined && (
              <Box sx={{ mt: 2 }}>
                <CriterionSection
                  criterion={availableCriterion}
                  context={criterionContext}
                  hideProbationProgress
                  metaChips={
                    availabilityCalendar.uptimePercent != undefined && (
                      <AvailabilityUptimeChip
                        uptimePercent={availabilityCalendar.uptimePercent}
                        displayStatus={getCriterionDisplayStatus(
                          availableCriterion,
                        )}
                      />
                    )
                  }
                  statusChip={
                    <CriterionStatusChip
                      displayStatus={getCriterionDisplayStatus(
                        availableCriterion,
                      )}
                    />
                  }
                >
                  <AvailabilityCriterionBody
                    criterion={availableCriterion}
                    calendar={availabilityCalendar}
                    now={now}
                    availabilityError={sealAnalysis?.availabilityError}
                  />
                </CriterionSection>
              </Box>
            )}

            {compliantCriterion != undefined && (
              <Box sx={{ mt: 2 }}>
                <CriterionSection
                  criterion={compliantCriterion}
                  context={criterionContext}
                  statusChip={
                    <CriterionStatusChip
                      displayStatus={getCriterionDisplayStatus(
                        compliantCriterion,
                      )}
                    />
                  }
                >
                  <ComplianceCriterionBody
                    criterion={compliantCriterion}
                    report={latestDataset?.validation_report}
                    now={now}
                  />
                </CriterionSection>
              </Box>
            )}

            {freshCoverageCriterion != undefined && (
              <Box sx={{ mt: 2 }}>
                <CriterionSection
                  criterion={freshCoverageCriterion}
                  context={criterionContext}
                  hideProbationProgress
                  statusChip={
                    <CriterionStatusChip
                      displayStatus={getCriterionDisplayStatus(
                        freshCoverageCriterion,
                      )}
                    />
                  }
                >
                  <FreshCoverageCriterionBody
                    criterion={freshCoverageCriterion}
                    serviceWindow={serviceWindow}
                    now={now}
                  />
                </CriterionSection>
              </Box>
            )}

            {freshContinuousCriterion != undefined && (
              <Box sx={{ mt: 2 }}>
                <CriterionSection
                  criterion={freshContinuousCriterion}
                  context={criterionContext}
                  hideProbationProgress
                  metaChips={
                    coverageWindowLength != undefined && (
                      <CoverageWindowChip
                        windowLength={coverageWindowLength}
                        displayStatus={getCriterionDisplayStatus(
                          freshContinuousCriterion,
                        )}
                        withinMax={
                          continuousCoverage?.latest_state?.newer
                            .within_max_coverage_window
                        }
                      />
                    )
                  }
                  statusChip={
                    <CriterionStatusChip
                      displayStatus={getCriterionDisplayStatus(
                        freshContinuousCriterion,
                      )}
                    />
                  }
                >
                  <ContinuousCoverageCriterionBody
                    criterion={freshContinuousCriterion}
                    coverage={continuousCoverage}
                    now={now}
                    feedId={feed.id}
                  />
                </CriterionSection>
              </Box>
            )}
          </Box>
        </SectionContainer>
      </Box>
    </Container>
  );
}
