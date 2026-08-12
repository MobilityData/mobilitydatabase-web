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

export default async function SealOfReliabilityDescriptionPage(): Promise<ReactElement> {
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
              {heroContent.title}
            </Typography>
            {heroContent.paragraphs.map((paragraph) => (
              <Typography
                variant='body2'
                sx={{ mb: 1, color: 'text.secondary', lineHeight: '1.4rem' }}
                key={paragraph}
              >
                {paragraph}
              </Typography>
            ))}
            <Button variant='text' sx={{ ml: -1 }}>
              See a feed measured asainst the standard (todo)
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
              alt={'current placeholder'}
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
                Feeds meeting the standard
              </Typography>
              <LinearProgress variant='determinate' value={41} />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mt: 0.5,
                }}
              >
                <Typography variant='caption' color='primary'>
                  41% meets
                </Typography>
                <Typography variant='caption'>59% below standard</Typography>
              </Box>
            </Box>
          </Box>
        </Container>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }} maxWidth='lg'>
        <Typography
          variant='h6'
          color='primary'
          sx={{ fontWeight: 700, mb: 1 }}
        >
          Benefits
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
          }}
        >
          {benefitEntries.map((entry) => {
            const BenefitIcon = entry.icon;
            return (
              <Card variant='section' sx={{ mb: 0 }} key={entry.title}>
                <CardSectionTitle component='h3'>
                  <BenefitIcon fontSize='inherit' aria-hidden />
                  {entry.title}
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
                    {entry.items.map((item) => (
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
        <Typography
          variant='h6'
          color='primary'
          sx={{ fontWeight: 700, mb: 1 }}
        >
          The criteria for the Seal of Reliability
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
            gap: 2,
          }}
        >
          {criteriaEntries.map((entry) => (
            <Card variant='section' sx={{ mb: 0 }} key={entry.title}>
              <CardSectionTitle component='h3'>
                <LockIcon fontSize='inherit' aria-hidden />
                {entry.title}
              </CardSectionTitle>
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>
                  {entry.subtitle}
                </Typography>
                <Typography variant='body2' sx={{ mt: 1 }}>
                  {entry.description}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography
          variant='h6'
          color='primary'
          sx={{ fontWeight: 700, mb: 1 }}
        >
          Grace periods
        </Typography>
        <Typography variant='body2' sx={{ mb: 2 }}>
          Temporary issues won&apos;t immediately cost an agency its Seal. The
          following windows apply per violation type.
        </Typography>
        <TableContainer
          sx={{ backgroundColor: 'background.default', borderRadius: '6px' }}
        >
          <Table aria-label='Grace periods'>
            <TableHead>
              <TableRow>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '150px' }}
                >
                  Criterion
                </TableCell>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '150px' }}
                >
                  Trigger Condition
                </TableCell>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '125px' }}
                >
                  Grace Period
                </TableCell>
                <TableCell
                  component='th'
                  scope='col'
                  sx={{ fontWeight: 'bold', minWidth: '250px' }}
                >
                  Description
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
                <TableRow key={entry.criterion}>
                  <TableCell>
                    <Typography variant='body1' sx={{ fontWeight: 700 }}>
                      {entry.criterion}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='body1'>
                      {entry.triggerCondition}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='body1' sx={{ fontWeight: 'bold' }}>
                      {entry.gracePeriod}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='body1'>{entry.consequence}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionContainer>

      <SectionContainer sx={{ mt: 5 }}>
        <Typography
          variant='h6'
          color='primary'
          sx={{ fontWeight: 700, mb: 1 }}
        >
          Frequently asked questions
        </Typography>
        {faqEntries.map((entry, index) => (
          <Accordion key={entry.question} sx={accordionStyle}>
            <AccordionSummary
              aria-controls={`faq-panel-${index}-content`}
              id={`faq-panel-${index}-header`}
              expandIcon={<ExpandMoreIcon />}
            >
              <Typography sx={{ fontWeight: 'bold' }}>
                {entry.question}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography>{entry.answer}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </SectionContainer>
    </Container>
  );
}
