import {
  Alert,
  AlertTitle,
  Box,
  Card,
  CardContent,
  Container,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { type ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import { SEAL_CRITERION_ICONS } from '../../../../constants/sealCriteria';
import { fontFamily, theme } from '../../../../Theme';
import SectionContainer from '../../../../components/SectionContainer';
import CardSectionTitle from '../../../../components/CardSectionTitle';
import {
  GTFS_VALIDATOR_URL,
  clockStartEntries,
  continuousRuleEntries,
  earningPhaseEntries,
  feedInfoComparisonEntries,
  methodologyEntries,
  rollingCoverageExamples,
  scenarioEntries,
} from '../lib/content';
import RichText from '../../../../components/RichText';
import RollingCoverageCard from './RollingCoverageCard';
import ScenarioCard from './ScenarioCard';

const { primary, success, divider } = theme.vars.palette;

const {
  official: OfficialIcon,
  stable: StableIcon,
  available: AvailableIcon,
  compliant: CompliantIcon,
  freshRolling: FreshRollingIcon,
  freshContinuous: FreshContinuousIcon,
} = SEAL_CRITERION_ICONS;

const twoColumnGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
  gap: 2,
} as const;

const threeColumnGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
  gap: 2,
} as const;

/**
 * The four short criteria sit two-per-row, so each container stretches to its
 * neighbour's height and the body fills the leftover space. That keeps the
 * closing notice pinned to the bottom of both cards in a row.
 */
const criterionContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
} as const;

/** Spacing between the blocks that make up a single criterion's explanation. */
const criterionBodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  flexGrow: 1,
  // Pushes the trailing notice down when the neighbouring card is taller.
  '& > :last-child': { mt: 'auto' },
} as const;

function BulletList({ items }: { items: string[] }): ReactElement {
  return (
    <Box
      component='ul'
      sx={{ pl: 2, m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      {items.map((item) => (
        <li key={item}>
          <Typography variant='body1'>
            <RichText text={item} />
          </Typography>
        </li>
      ))}
    </Box>
  );
}

export default async function HowItIsCalculatedPage(): Promise<ReactElement> {
  const t = await getTranslations('sealOfReliability.howItIsCalculated');

  const officialParagraphs = t.raw('official.paragraphs') as string[];
  const stableItems = t.raw('stable.items') as string[];
  const earningParagraphs = t.raw('earning.paragraphs') as string[];

  return (
    <Container component='main' sx={{ width: '100%', m: 'auto' }} maxWidth='lg'>
      <SectionContainer sx={{ mt: 0, p: { xs: 3, md: 4 } }} maxWidth='lg'>
        <Typography
          variant='subtitle2'
          color='primary'
          sx={{ fontWeight: 700, mb: 1 }}
        >
          {t('eyebrow')}
        </Typography>
        <Typography variant='h1' sx={{ mb: 2 }}>
          {t('title')}
        </Typography>
        <Typography
          variant='body1'
          sx={{
            color: 'text.secondary',
            lineHeight: '1.4rem',
            maxWidth: '46rem',
          }}
        >
          {t('intro')}
        </Typography>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography variant='sectionTitle'>{t('methodology.title')}</Typography>
        <Typography variant='body1' sx={{ mb: 2 }}>
          {t('methodology.description')}
        </Typography>
        <Box sx={threeColumnGrid}>
          {methodologyEntries.map((entry) => {
            const MethodologyIcon = entry.icon;
            return (
              <Card variant='section' sx={{ mb: 0 }} key={entry.titleKey}>
                <CardSectionTitle component='h3' sx={{ mb: 0 }}>
                  <MethodologyIcon fontSize='inherit' aria-hidden />
                  {t(entry.titleKey)}
                </CardSectionTitle>
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Typography variant='body1'>
                    {t(entry.descriptionKey)}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </SectionContainer>

      <Box sx={{ ...twoColumnGrid, mt: 5 }}>
        <SectionContainer sx={criterionContainerStyle}>
          <Typography variant='sectionTitle'>
            <OfficialIcon fontSize='inherit' aria-hidden />
            {t('official.title')}
          </Typography>
          <Box sx={criterionBodyStyle}>
            {officialParagraphs.map((paragraph) => (
              <Typography variant='body1' key={paragraph}>
                <RichText text={paragraph} />
              </Typography>
            ))}
            <Alert severity='info'>{t('official.notice')}</Alert>
          </Box>
        </SectionContainer>

        <SectionContainer sx={criterionContainerStyle}>
          <Typography variant='sectionTitle'>
            <StableIcon fontSize='inherit' aria-hidden />
            {t('stable.title')}
          </Typography>
          <Box sx={criterionBodyStyle}>
            <Typography variant='body1'>{t('stable.description')}</Typography>
            <BulletList items={stableItems} />
            <Alert severity='info'>{t('stable.notice')}</Alert>
          </Box>
        </SectionContainer>

        <SectionContainer sx={criterionContainerStyle}>
          <Typography variant='sectionTitle'>
            <AvailableIcon fontSize='inherit' aria-hidden />
            {t('available.title')}
          </Typography>
          <Box sx={criterionBodyStyle}>
            <Typography variant='body1'>
              {t('available.description')}
            </Typography>
            <Alert severity='warning'>
              <AlertTitle>{t('available.noticeTitle')}</AlertTitle>
              {t('available.notice')}
            </Alert>
          </Box>
        </SectionContainer>

        <SectionContainer sx={criterionContainerStyle}>
          <Typography variant='sectionTitle'>
            <CompliantIcon fontSize='inherit' aria-hidden />
            {t('compliant.title')}
          </Typography>
          <Box sx={criterionBodyStyle}>
            <Typography variant='body1'>
              {t.rich('compliant.description', {
                link: (chunks) => (
                  <Link
                    href={GTFS_VALIDATOR_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </Typography>
            <Typography variant='body1'>
              {t('compliant.validatorScope')}
            </Typography>
            <Alert severity='warning'>
              <AlertTitle>{t('compliant.noticeTitle')}</AlertTitle>
              {t('compliant.notice')}
            </Alert>
          </Box>
        </SectionContainer>
      </Box>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography variant='sectionTitle'>
          <FreshRollingIcon fontSize='inherit' aria-hidden />
          {t('freshRolling.title')}
        </Typography>
        <Box sx={criterionBodyStyle}>
          <Typography variant='body1'>
            <RichText text={t('freshRolling.description')} />
          </Typography>
          <Box>
            <Typography
              variant='subtitle2'
              component='h3'
              sx={{ fontWeight: 700, mb: 1 }}
            >
              {t('freshRolling.examplesTitle')}
            </Typography>
            <Box sx={twoColumnGrid}>
              {rollingCoverageExamples.map((example) => (
                <RollingCoverageCard key={example.id} example={example} />
              ))}
            </Box>
          </Box>
          <Alert severity='warning'>
            <AlertTitle>{t('freshRolling.noticeTitle')}</AlertTitle>
            {t('freshRolling.notice')}
          </Alert>
        </Box>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography variant='sectionTitle'>
          <FreshContinuousIcon fontSize='inherit' aria-hidden />
          {t('freshContinuous.title')}
        </Typography>
        <Box sx={criterionBodyStyle}>
          <Typography variant='body1'>
            {t('freshContinuous.description')}
          </Typography>

          <Box sx={{ ...twoColumnGrid, my: 2 }}>
            {continuousRuleEntries.map((entry) => (
              <Card variant='section' sx={{ mb: 0 }} key={entry.titleKey}>
                <CardSectionTitle component='h3'>
                  {t(entry.titleKey)}
                </CardSectionTitle>
                <Typography variant='body1'>
                  {t(entry.descriptionKey)}
                </Typography>
              </Card>
            ))}
          </Box>

          <Box>
            <Typography
              variant='subtitle2'
              component='h3'
              sx={{ fontWeight: 700, mb: 1 }}
            >
              <RichText text={t('freshContinuous.feedInfo.title')} />
            </Typography>
            <Typography variant='body1' sx={{ mb: 2 }}>
              <RichText text={t('freshContinuous.feedInfo.description')} />
            </Typography>
            <Box sx={twoColumnGrid}>
              {feedInfoComparisonEntries.map((entry) => (
                <Card variant='section' sx={{ mb: 0 }} key={entry.titleKey}>
                  <CardSectionTitle component='h4'>
                    <RichText text={t(entry.titleKey)} />
                  </CardSectionTitle>
                  <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    <BulletList items={t.raw(entry.itemsKey) as string[]} />
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>

          <Box>
            <Typography
              variant='subtitle2'
              component='h3'
              sx={{ fontWeight: 700, mb: 1 }}
            >
              {t('freshContinuous.scenarios.title')}
            </Typography>
            <Box sx={twoColumnGrid}>
              {scenarioEntries.map((scenario) => (
                <ScenarioCard key={scenario.id} scenario={scenario} />
              ))}
            </Box>
          </Box>

          <Alert severity='error'>
            <AlertTitle>{t('freshContinuous.noticeTitle')}</AlertTitle>
            {t('freshContinuous.notice')}
          </Alert>
        </Box>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography variant='sectionTitle'>{t('earning.title')}</Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            borderRadius: '12px',
            overflow: 'hidden',
            mb: 3,
          }}
        >
          {earningPhaseEntries.map((entry, index) => {
            const isLast = index === earningPhaseEntries.length - 1;
            const accentColor =
              index === 0
                ? 'text.secondary'
                : index === 1
                  ? 'primary.main'
                  : 'success.main';
            const backgroundColor =
              index === 0
                ? 'action.hover'
                : `rgba(${index === 1 ? primary.mainChannel : success.mainChannel} / 0.08)`;
            const dividerBorder = `1px solid ${divider}`;
            return (
              <Box
                key={entry.titleKey}
                sx={{
                  flex: { xs: '1 1 auto', md: index === 1 ? 2.5 : 1 },
                  p: 2.5,
                  borderBottom: {
                    xs: isLast ? 'none' : dividerBorder,
                    md: 'none',
                  },
                  borderRight: {
                    xs: 'none',
                    md: isLast ? 'none' : dividerBorder,
                  },
                  backgroundColor,
                }}
              >
                <Typography
                  variant='caption'
                  sx={{
                    display: 'block',
                    fontFamily: fontFamily.secondary,
                    color: accentColor,
                  }}
                >
                  {t('earning.phaseLabel', { number: index + 1 })}
                </Typography>
                <Typography
                  variant='subtitle1'
                  component='h3'
                  sx={{ fontWeight: 700, mt: 0.5 }}
                >
                  {t(entry.titleKey)}
                </Typography>
                <Typography
                  variant='body2'
                  sx={{ color: 'text.secondary', mt: 0.5 }}
                >
                  {t(entry.descriptionKey)}
                </Typography>
              </Box>
            );
          })}
        </Box>

        <Box sx={{ mb: 3 }}>
          {earningParagraphs.map((paragraph) => (
            <Typography variant='body1' sx={{ mb: 1.5 }} key={paragraph}>
              <RichText text={paragraph} />
            </Typography>
          ))}
        </Box>

        <Typography
          variant='subtitle2'
          component='h3'
          sx={{ fontWeight: 700, mt: 3, mb: 1 }}
        >
          {t('earning.clock.title')}
        </Typography>
        <TableContainer
          sx={{ backgroundColor: 'background.default', borderRadius: '6px' }}
        >
          <Table aria-label={t('earning.clock.tableAriaLabel')}>
            <TableHead>
              <TableRow>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '200px' }}
                >
                  {t('earning.clock.columns.criterion')}
                </TableCell>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '300px' }}
                >
                  {t('earning.clock.columns.clockStarts')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody
              sx={{
                '& tr:nth-of-type(odd)': { backgroundColor: 'action.hover' },
              }}
            >
              {clockStartEntries.map((entry) => (
                <TableRow key={entry.criterionKey}>
                  <TableCell>
                    <Typography variant='body1' sx={{ fontWeight: 700 }}>
                      {t(entry.criterionKey)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='body1'>
                      <RichText text={t(entry.descriptionKey)} />
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 2 }}>
          <Alert severity='info'>
            <AlertTitle>{t('earning.noticeTitle')}</AlertTitle>
            {t('earning.notice')}
          </Alert>
        </Box>
      </SectionContainer>
    </Container>
  );
}
