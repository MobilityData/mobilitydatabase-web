'use client';
import React from 'react';
import { Box, IconButton, Typography, useTheme } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { GitHub, LinkedIn, OpenInNew } from '@mui/icons-material';
import { MOBILITY_DATA_LINKS } from '../constants/Navigation';
import { fontFamily } from '../Theme';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { FooterLink, FooterColumnTitle } from './FooterElements';
import { useRemoteConfig } from '../context/RemoteConfigProvider';

const Footer: React.FC = () => {
  const theme = useTheme();
  const { colorScheme } = useColorScheme();
  const t = useTranslations('footer');
  const { config } = useRemoteConfig();
  const FOOTER_COLUMN_WIDTH = '185px';
  const SlackSvg = (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='24px'
      height='24px'
      viewBox='0 0 24 24'
    >
      <path
        fill='currentColor'
        d='M6 15a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2h2zm1 0a2 2 0 0 1 2-2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2a2 2 0 0 1-2-2zm2-8a2 2 0 0 1-2-2a2 2 0 0 1 2-2a2 2 0 0 1 2 2v2zm0 1a2 2 0 0 1 2 2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2a2 2 0 0 1 2-2zm8 2a2 2 0 0 1 2-2a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-2zm-1 0a2 2 0 0 1-2 2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2a2 2 0 0 1 2 2zm-2 8a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2v-2zm0-1a2 2 0 0 1-2-2a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2a2 2 0 0 1-2 2z'
      />
    </svg>
  );

  const currentYear = new Date().getFullYear();

  return (
    <Box
      component='footer'
      sx={{
        backgroundColor: theme.vars.palette.background.paper,
        width: '100%',
        boxSizing: 'border-box',
        mt: 6,
      }}
    >
      {/* Main footer content */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 4, md: 2 },
          px: { xs: 3, md: 8 },
          py: 5,
          maxWidth: '1400px',
          mx: 'auto',
          flexWrap: 'wrap',
        }}
      >
        {/* Brand column */}
        <Box sx={{ flex: 2, minWidth: '200px', pr: { md: 4 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Image
              src={
                colorScheme !== 'dark'
                  ? '/assets/MOBILTYDATA_logo_light_blue_M.png'
                  : '/assets/MOBILTYDATA_logo_purple_M.png'
              }
              alt={t('aria.logo')}
              width={32}
              height={32}
            />
            <Typography
              variant='h6'
              sx={{
                fontWeight: 700,
              }}
            >
              MobilityDatabase
            </Typography>
          </Box>

          <Typography
            sx={{
              color: theme.vars.palette.text.secondary,
              fontSize: theme.typography.body2.fontSize,
              lineHeight: 1.6,
              mb: 3,
              fontFamily: fontFamily.primary,
            }}
          >
            {t('tagline')}
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              aria-label={t('aria.github')}
              component='a'
              href={MOBILITY_DATA_LINKS.github}
              target='_blank'
              rel='noopener noreferrer'
              size='small'
            >
              <GitHub />
            </IconButton>
            <IconButton
              aria-label={t('aria.slack')}
              component='a'
              href={MOBILITY_DATA_LINKS.slack}
              target='_blank'
              rel='noopenernoreferrer'
              size='small'
            >
              {SlackSvg}
            </IconButton>
            <IconButton
              aria-label={t('aria.linkedin')}
              component='a'
              href={MOBILITY_DATA_LINKS.linkedin}
              target='_blank'
              rel='noopener noreferrer'
              size='small'
            >
              <LinkedIn />
            </IconButton>
          </Box>
        </Box>

        <Box
          sx={{
            width: '100%',
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            maxWidth: '800px',
          }}
        >
          {/* Platform column */}
          <Box sx={{ width: FOOTER_COLUMN_WIDTH }}>
            <FooterColumnTitle>{t('columns.platform')}</FooterColumnTitle>
            <FooterLink href='/feeds'>{t('links.feeds')}</FooterLink>
            <FooterLink href='/contribute'>{t('links.addFeed')}</FooterLink>
            <FooterLink
              href='https://mobilitydata.github.io/mobility-feed-api/SwaggerUI/index.html'
              external
            >
              {t('links.apiDocs')}
            </FooterLink>
          </Box>

          {/* Validators column */}

          <Box sx={{ width: FOOTER_COLUMN_WIDTH }}>
            <FooterColumnTitle>{t('columns.validators')}</FooterColumnTitle>
            <FooterLink
              href='https://gtfs-validator.mobilitydata.org/'
              external
            >
              {t('links.gtfsValidator')}{' '}
              <OpenInNew sx={{ fontSize: '1rem', verticalAlign: 'middle' }} />
            </FooterLink>
            <FooterLink
              href='https://github.com/MobilityData/gtfs-realtime-validator'
              external
            >
              {t('links.gtfsRtValidator')}{' '}
              <OpenInNew sx={{ fontSize: '1rem', verticalAlign: 'middle' }} />
            </FooterLink>
            {config.gbfsValidator ? (
              <FooterLink href='/gbfs-validator'>
                {t('links.gbfsValidator')}{' '}
              </FooterLink>
            ) : (
              <FooterLink
                href='https://gbfs-validator.mobilitydata.org/'
                external
              >
                {t('links.gbfsValidator')}{' '}
                <OpenInNew sx={{ fontSize: '1rem', verticalAlign: 'middle' }} />
              </FooterLink>
            )}
          </Box>

          {/* Company column */}
          <Box sx={{ width: FOOTER_COLUMN_WIDTH }}>
            <FooterColumnTitle>{t('columns.company')}</FooterColumnTitle>
            <FooterLink href='/about'>{t('links.about')}</FooterLink>
            <FooterLink href='/faq'>{t('links.faq')}</FooterLink>
            <FooterLink href='/contact-us'>{t('links.contactUs')}</FooterLink>
            <FooterLink
              href='https://share.mobilitydata.org/mobility-database-feedback'
              external
            >
              {t('links.shareFeedback')}
            </FooterLink>
          </Box>

          {/* Legal column */}
          <Box sx={{ width: FOOTER_COLUMN_WIDTH }}>
            <FooterColumnTitle>{t('columns.legal')}</FooterColumnTitle>
            <FooterLink href='/privacy-policy'>
              {t('links.privacyPolicy')}
            </FooterLink>
            <FooterLink href='/terms-and-conditions'>
              {t('links.termsAndConditions')}
            </FooterLink>
          </Box>
        </Box>
      </Box>

      {/* Bottom bar */}
      <Box
        sx={{
          backgroundColor: theme.vars.palette.background.paper,
          borderTop: `1px solid ${theme.vars.palette.divider}`,
          px: { xs: 3, md: 8 },
          py: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: '1400px',
            mx: 'auto',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Image
              src={
                colorScheme !== 'dark'
                  ? '/assets/MOBILTYDATA_logo_light_blue_M.png'
                  : '/assets/MOBILTYDATA_logo_purple_M.png'
              }
              alt=''
              width={18}
              height={18}
              style={{ opacity: 0.8 }}
            />
            <Typography
              sx={{
                color: theme.vars.palette.text.secondary,
                fontSize: '0.8rem',
                fontFamily: fontFamily.secondary,
              }}
            >
              {t('maintainedBy')}
            </Typography>
          </Box>
          <Typography
            sx={{
              color: theme.vars.palette.text.secondary,
              fontSize: '0.8rem',
              fontFamily: fontFamily.secondary,
            }}
          >
            {t('copyright', { year: currentYear })}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Footer;
