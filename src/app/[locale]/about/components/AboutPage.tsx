import { Container, Typography, Button } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { type ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function AboutPage(): Promise<ReactElement> {
  const t = await getTranslations('about');

  return (
    <Container component='main'>
      <Typography variant='h1'>{t('title')}</Typography>
      <Container
        sx={{
          backgroundColor: 'background.paper',
          borderRadius: '6px',
          paddingTop: 3,
          paddingBottom: 3,
          mt: 3,
        }}
        maxWidth={false}
      >
        <Typography sx={{ fontWeight: 700 }}>
          {t('description')}
          <br />
          <Button
            component={'a'}
            variant='contained'
            sx={{ mt: 3 }}
            endIcon={<OpenInNewIcon />}
            href='https://mobilitydata.org/'
            rel='noreferrer'
            target='_blank'
          >
            {t('learnMore')}
          </Button>
        </Typography>
        <Typography
          variant='h5'
          color='primary'
          sx={{ fontWeight: 700, mt: 5, mb: 1 }}
        >
          {t('whyUse')}
        </Typography>
        <Typography component='div' className='answer'>
          {t('whyUseAnswer')}
          <br /> <br />
          In addition to our database, we develop and maintain other tools that
          integrate with it such as&#20;
          <Button
            variant='text'
            className='line-start inline'
            href={'https://gtfs-validator.mobilitydata.org/'}
            rel='noreferrer'
            target='_blank'
            endIcon={<OpenInNewIcon />}
          >
            {t('gtfsValidator')}
          </Button>
          and&#20;
          <Button
            variant='text'
            className='line-start inline'
            href={'https://gbfs-validator.mobilitydata.org/'}
            rel='noreferrer'
            target='_blank'
            endIcon={<OpenInNewIcon />}
          >
            {t('gbfsValidator')}
          </Button>
          Additional benefits of using the Mobility Database include
          <ul>
            <li>{t('benefits.mirrored')}</li>
            <li>{t('benefits.boundingBoxes')}</li>
            <li>
              <Link href='/contribute' rel='noreferrer' target='_blank'>
                <Button variant='text' className='line-start inline'>
                  {t('benefits.addFeeds')}
                </Button>
              </Link>
            </li>
            <li>{t('benefits.openSource')}</li>
          </ul>
        </Typography>
      </Container>
    </Container>
  );
}
