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

// Utils
import { type AllFeedType } from '../../../services/feeds/utils';
import { type components } from '../../../services/feeds/types';
import { type SealAnalysisData } from '../../../[locale]/feeds/[feedDataType]/[feedId]/lib/seal-analysis-data';
import {
  getCriterionDisplayStatus,
  type SealCriterionContext,
} from '../../../constants/sealCriteria';
import { formatProvidersSorted } from '../Feed.functions';
import SectionContainer from '../../../components/SectionContainer';

interface Props {
  feed: AllFeedType;
  sealAnalysis?: SealAnalysisData;
}

export default async function FeedReliabilityView({
  feed,
  sealAnalysis,
}: Props): Promise<ReactElement> {
  if (feed == undefined) notFound();
  const reliability = sealAnalysis?.reliability;
  const t = await getTranslations('feeds');
  const sortedProviders = formatProvidersSorted(feed.provider ?? '');

  // Pinned once here so every date-derived branch below resolves to the same
  // instant during SSR and hydration. This route is force-dynamic, so it is
  // request time.
  const criterionContext: SealCriterionContext = {
    isProducerUrlUnstable: feed.source_info?.is_producer_url_unstable,
    feedCreatedAt: feed.created_at,
    now: new Date(),
  };
  const producerUrl = feed.source_info?.producer_url;

  const findCriterion = (
    name: components['schemas']['ReliabilityCriterion']['criterion'],
  ): components['schemas']['ReliabilityCriterion'] | undefined =>
    reliability?.criteria?.find((c) => c.criterion === name);

  const officialCriterion = findCriterion('official');
  const stableCriterion = findCriterion('stable');

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
              <Typography
                component='h2'
                variant='h6'
                sx={{ fontWeight: 700 }}
                color='secondary'
              >
                {t('reliabilityAnalysisTitle')}
              </Typography>
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
          </Box>
        </SectionContainer>
      </Box>
    </Container>
  );
}
