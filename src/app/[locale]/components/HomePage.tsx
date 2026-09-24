import { type ReactElement } from 'react';
import { Box, Typography, Button, Container, Divider, Paper } from '@mui/material';
import {
  Search,
  CheckCircleOutlineOutlined,
  PowerOutlined,
} from '@mui/icons-material';
import { WEB_VALIDATOR_LINK } from '../../constants/Navigation';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchBox from './SearchBox';
import { getTranslations } from 'next-intl/server';
import '../../styles/TextShimmer.css';
import Link from 'next/link';

interface ActionBoxProps {
  IconComponent: React.ElementType;
  iconHeight: string;
  buttonHref: string;
  buttonText: string;
}

const ActionBox = ({
  IconComponent,
  iconHeight,
  buttonHref,
  buttonText,
}: ActionBoxProps): React.ReactElement => (
  <Paper
    elevation={0}
    variant='outlined'
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,
      p: 3,
      m: 1,
      borderRadius: 2,
      backgroundColor: 'background.paper',
      transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: (theme) => theme.shadows[2],
      },
    }}
  >
    <IconComponent
      sx={{ width: '100%', height: iconHeight, color: 'primary.main', mb: 2 }}
    />
    <Link href={buttonHref} style={{ width: '100%', textDecoration: 'none' }}>
      <Button variant='contained' fullWidth sx={{ px: 2, fontWeight: 600 }}>
        {buttonText}
      </Button>
    </Link>
  </Paper>
);

/**
 * Home page component that fetches translations directly.
 * Used by [locale]/page.tsx
 */
export default async function HomePage(): Promise<ReactElement> {
  const t = await getTranslations('home');

  return (
    <Container component='main' sx={{ px: { xs: 0, md: 3 } }}>
      <Box
        component='section'
        sx={{
          mt: 6,
          display: 'flex',
          flexDirection: 'column',
        }}
        mx={{ xs: '20px', m: 'auto' }}
        maxWidth={{ xs: '100%', md: '1600px' }}
        role='main'
        aria-label='Mobility Database Home'
      >
        <Typography
          component='h1'
          sx={{
            fontSize: {
              xs: '36px',
              sm: '48px',
            },
            fontStyle: 'normal',
            fontWeight: 700,
            lineHeight: 'normal',
            textAlign: 'center',
          }}
          data-testid='home-title'
          className='shimmer'
        >
          {t('title')}
        </Typography>
        <Typography
          component='h2'
          variant='h5'
          sx={{
            textAlign: 'center',
            fontWeight: 700,
            mt: 4,
          }}
        >
          {t('servingOver') + ' '}
          <Box
            component='span'
            sx={{ fontSize: 30, color: 'primary.main', mx: 1 }}
            itemProp='numberOfItems'
          >
            6000
          </Box>
          {' ' + t('feeds') + ' '}
          <Box
            component='span'
            sx={{ fontSize: 30, color: 'primary.main', mx: 1 }}
            itemProp='spatialCoverage'
          >
            99
          </Box>
          {' ' + t('countries')}
        </Typography>
        <SearchBox />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            margin: '30px 0',
            position: 'relative',
          }}
        >
          <Divider
            sx={{
              flexGrow: 1,
              backgroundColor: 'text.primary',
            }}
            variant='middle'
          />
          <Typography
            sx={{ fontWeight: 'bold', marginX: '8px' }}
            variant='body1'
          >
            {t('or')}
          </Typography>
          <Divider
            sx={{
              flexGrow: 1,
              backgroundColor: 'text.primary',
              mx: '16',
            }}
            variant='middle'
          />
        </Box>
        <Box
          component='nav'
          sx={{
            display: 'flex',
            justifyContent: 'center',
            flexDirection: { xs: 'column', sm: 'row' },
            width: '700px',
            maxWidth: '100%',
            margin: 'auto',
          }}
          role='navigation'
          aria-label='Main actions'
        >
          <ActionBox
            IconComponent={Search}
            iconHeight='70px'
            buttonHref='/feeds'
            buttonText={t('browseFeeds')}
          />
          <ActionBox
            IconComponent={CheckCircleOutlineOutlined}
            iconHeight='70px'
            buttonHref='/contribute'
            buttonText={t('addFeed')}
          />
          <ActionBox
            IconComponent={PowerOutlined}
            iconHeight='70px'
            buttonHref='/sign-up'
            buttonText={t('signUpApi')}
          />
        </Box>
        <Paper
          component='section'
          elevation={0}
          variant='outlined'
          sx={{
            backgroundColor: 'background.paper',
            borderRadius: 2,
            p: {
              xs: 3,
              sm: 4,
            },
            fontWeight: 700,
            mt: 6,
          }}
          role='contentinfo'
          aria-label='About Mobility Database'
        >
          <Typography component='h3' sx={{ fontWeight: 700, mb: 2 }}>
            About Our Platform
          </Typography>
          <Typography sx={{ mb: 2 }}>{t('description')}</Typography>
          <Typography sx={{ mb: 2 }}>
            {t('validatorIntro')}
            <Button
              variant='text'
              className='inline'
              href={WEB_VALIDATOR_LINK}
              rel='noreferrer'
              target='_blank'
              endIcon={<OpenInNewIcon />}
              aria-label='GTFS Validator - Opens in new tab'
            >
              {t('gtfsValidator')}
            </Button>
            {t('and')}
            <Button
              variant='text'
              className='inline'
              href='https://gbfs-validator.mobilitydata.org/'
              rel='noreferrer'
              target='_blank'
              endIcon={<OpenInNewIcon />}
              aria-label='GBFS Validator - Opens in new tab'
            >
              {t('gbfsValidator')}
            </Button>
            {t('validatorOutro')}
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}
