import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Card,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  LinearProgress,
  CardContent,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { type ReactElement } from 'react';
import Image from 'next/image';
import LockIcon from '@mui/icons-material/Lock';
import { getTranslations } from 'next-intl/server';
import CardSectionTitle from '../../../components/CardSectionTitle';
import SectionContainer from '../../../components/SectionContainer';
import { accordionStyle } from '../../../components/accordionStyle';
import {
  benefitEntries,
  criteriaEntries,
  faqEntries,
  gracePeriodEntries,
  heroContent,
} from '../lib/content';

const FEEDS_MEETING_STANDARD_PERCENT = 41;
const FEEDS_BELOW_STANDARD_PERCENT = 100 - FEEDS_MEETING_STANDARD_PERCENT;

export default async function SealOfReliabilityDescriptionPage(): Promise<ReactElement> {
  const t = await getTranslations('sealOfReliability');
  const heroParagraphs = t.raw(heroContent.paragraphsKey) as string[];

  return (
    <Container
      component='main'
      sx={{
        width: '100%',
        m: 'auto',
      }}
      maxWidth='lg'
    >
      <SectionContainer sx={{ mt: 0 }} maxWidth='lg'>
        <Container
          maxWidth='lg'
          sx={{
            display: 'flex',
            flexWrap: { xs: 'wrap', md: 'nowrap' },
            gap: 2,
            p: 4,
          }}
        >
          <Box sx={{ width: { xs: '100%', md: '55%' } }}>
            <Typography variant='h1' sx={{ mb: 2 }}>
              {t(heroContent.titleKey)}
            </Typography>
            {heroParagraphs.map((paragraph) => (
              <Typography
                variant='body1'
                sx={{ mb: 1, color: 'text.secondary' }}
                key={paragraph}
              >
                {paragraph}
              </Typography>
            ))}
            <Button variant='text' sx={{ ml: -1 }}>
              {t(heroContent.ctaButtonKey)}
            </Button>
          </Box>
          <Box
            sx={{
              width: { xs: '100%', md: '45%' },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <Image
              src={'/assets/seal-reliability.png'}
              alt={t('hero.imageAlt')}
              width={250}
              height={250}
              style={{
                objectFit: 'contain',
                borderRadius: '4px',
              }}
            />
            <Box sx={{ width: '80%', mt: 1 }}>
              <Typography
                variant='subtitle2'
                sx={{ opacity: 0.7, fontWeight: 'bold', mb: 0.5 }}
              >
                {t('hero.feedsMeetingStandard')}
              </Typography>
              <LinearProgress
                variant='determinate'
                value={FEEDS_MEETING_STANDARD_PERCENT}
              />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mt: 0.5,
                }}
              >
                <Typography variant='caption' color='primary'>
                  {t('hero.meetsPercent', {
                    percent: FEEDS_MEETING_STANDARD_PERCENT,
                  })}
                </Typography>
                <Typography variant='caption'>
                  {t('hero.belowStandardPercent', {
                    percent: FEEDS_BELOW_STANDARD_PERCENT,
                  })}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Container>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }} maxWidth='lg'>
        <Typography variant='sectionTitle'>{t('benefits.title')}</Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
          }}
        >
          {benefitEntries.map((entry) => {
            const BenefitIcon = entry.icon;
            const items = t.raw(entry.itemsKey) as string[];
            return (
              <Card variant='section' sx={{ mb: 0 }} key={entry.titleKey}>
                <CardSectionTitle component='h3'>
                  <BenefitIcon fontSize='inherit' aria-hidden />
                  {t(entry.titleKey)}
                </CardSectionTitle>
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Box
                    component={'ul'}
                    sx={{
                      pl: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      m: 0,
                    }}
                  >
                    {items.map((item) => (
                      <li key={item}>
                        <Typography variant='body1'>{item}</Typography>
                      </li>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography variant='sectionTitle'>{t('criteria.title')}</Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
            gap: 2,
          }}
        >
          {criteriaEntries.map((entry) => (
            <Card variant='section' sx={{ mb: 0 }} key={entry.titleKey}>
              <CardSectionTitle component='h3'>
                <LockIcon fontSize='inherit' aria-hidden />
                {t(entry.titleKey)}
              </CardSectionTitle>
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>
                  {t(entry.subtitleKey)}
                </Typography>
                <Typography variant='body2' sx={{ mt: 1 }}>
                  {t(entry.descriptionKey)}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography variant='sectionTitle'>
          {t('gracePeriods.title')}
        </Typography>
        <Typography variant='body2' sx={{ mb: 2 }}>
          {t('gracePeriods.description')}
        </Typography>
        <TableContainer
          sx={{ backgroundColor: 'background.default', borderRadius: '6px' }}
        >
          <Table aria-label={t('gracePeriods.tableAriaLabel')}>
            <TableHead>
              <TableRow>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '150px' }}
                >
                  {t('gracePeriods.columns.criterion')}
                </TableCell>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '150px' }}
                >
                  {t('gracePeriods.columns.triggerCondition')}
                </TableCell>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '125px' }}
                >
                  {t('gracePeriods.columns.gracePeriod')}
                </TableCell>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '250px' }}
                >
                  {t('gracePeriods.columns.description')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody
              sx={{
                '& tr:nth-of-type(odd)': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              {gracePeriodEntries.map((entry) => (
                <TableRow key={entry.criterionKey}>
                  <TableCell>
                    <Typography variant='body1' sx={{ fontWeight: 700 }}>
                      {t(entry.criterionKey)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='body1'>
                      {t(entry.triggerConditionKey)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
                      {t(entry.gracePeriodKey)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='body1'>
                      {t(entry.consequenceKey)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography variant='sectionTitle'>{t('faq.title')}</Typography>
        {faqEntries.map((entry, index) => (
          <Accordion key={entry.questionKey} sx={accordionStyle}>
            <AccordionSummary
              aria-controls={`faq-panel-${index}-content`}
              id={`faq-panel-${index}-header`}
              expandIcon={<ExpandMoreIcon />}
            >
              <Typography sx={{ fontWeight: 'bold' }}>
                {t(entry.questionKey)}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography>{t(entry.answerKey)}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </SectionContainer>
    </Container>
  );
}
