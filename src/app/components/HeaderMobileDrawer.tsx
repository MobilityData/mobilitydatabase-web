'use client';

import * as React from 'react';
import { OpenInNew } from '@mui/icons-material';
import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  Typography,
  Divider,
  List,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useTheme,
  Link,
  InputBase,
  IconButton,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useRouter } from 'next/navigation';
import {
  ACCOUNT_TARGET,
  gbfsMetricsNavItems,
  gtfsMetricsNavItems,
  SIGN_IN_TARGET,
} from '../constants/Navigation';
import type NavigationItem from '../interface/Navigation';
import { fontFamily } from '../Theme';
import { mobileNavElementStyle } from './Header.style';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useRemoteConfig } from '../context/RemoteConfigProvider';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';

const websiteTile = 'MobilityDatabase';

interface DrawerContentProps {
  isAuthenticated: boolean;
  onLogoutClick: React.MouseEventHandler;
  navigationItems: NavigationItem[];
  metricsOptionsEnabled: boolean;
  onClose?: () => void;
}

export default function DrawerContent({
  isAuthenticated,
  onLogoutClick,
  navigationItems,
  metricsOptionsEnabled,
  onClose,
}: DrawerContentProps): React.ReactElement {
  const router = useRouter();
  const { config } = useRemoteConfig();
  const t = useTranslations('common');
  const tFeeds = useTranslations('feeds');
  const theme = useTheme();
  const { colorScheme } = useColorScheme();

  const [searchValue, setSearchValue] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const handleSearchSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed !== '') {
      router.push(`/feeds?q=${encodeURIComponent(trimmed)}`);
      onClose?.();
    }
    setSearchValue('');
  };

  return (
    <Box>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 1 }}
        onClick={() => {
          router.push('/');
        }}
      >
        <Image
          src={
            colorScheme !== 'dark'
              ? '/assets/MOBILTYDATA_logo_light_blue_M.png'
              : '/assets/MOBILTYDATA_logo_purple_M.png'
          }
          alt='MobilityData logo'
          width={40 * 1.05} // aspect ratio of the logo is slightly off, adjust width to prevent layout shift between themes
          height={40}
          priority
          fetchPriority='high'
        />

        <Typography
          component={'h2'}
          variant='h6'
          sx={{
            my: 2,
            cursor: 'pointer',
            color: theme.vars.palette.primary.main,
            fontWeight: 700,
          }}
          data-testid='websiteTile'
        >
          {websiteTile}
        </Typography>
      </Box>
      <Divider />
      <Box
        component='form'
        onSubmit={handleSearchSubmit}
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <InputBase
          inputRef={searchInputRef}
          value={searchValue}
          onChange={(e) => {
            setSearchValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchValue('');
            }
          }}
          placeholder={tFeeds('searchPlaceholder')}
          inputProps={{ 'aria-label': t('search') }}
          sx={{ flex: 1, fontSize: theme.typography.body2.fontSize }}
        />
        <IconButton size='small' type='submit' aria-label={t('search')}>
          <SearchIcon fontSize='small' />
        </IconButton>
      </Box>
      <List>
        {navigationItems.map((item) => (
          <Button
            variant='text'
            sx={mobileNavElementStyle}
            key={item.title}
            href={item.external === true ? item.target : '/' + item.target}
            target={item.external === true ? '_blank' : '_self'}
            rel={item.external === true ? 'noopener noreferrer' : ''}
            endIcon={item.external === true ? <OpenInNew /> : null}
            // className={activeTab.includes('/' + item.target) ? 'active' : ''}
          >
            {item.title}
          </Button>
        ))}

        <Divider sx={{ my: 2 }} />
        {config.gbfsValidator && (
          <Accordion disableGutters={true} sx={{ boxShadow: 'none' }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls='validators-content'
              id='validators-content'
            >
              <Typography
                variant={'subtitle1'}
                sx={{ fontFamily: fontFamily.secondary }}
              >
                {t('validators')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Button
                variant='text'
                sx={mobileNavElementStyle}
                href={'gbfs-validator'}
              >
                {t('gbfsValidator')}
              </Button>
              <Button
                variant='text'
                sx={mobileNavElementStyle}
                endIcon={<OpenInNew />}
                component={Link}
                href='https://gtfs-validator.mobilitydata.org/'
                target='_blank'
                rel='noopener noreferrer'
              >
                {t('gtfsValidator')}
              </Button>
              <Button
                variant='text'
                sx={mobileNavElementStyle}
                endIcon={<OpenInNew />}
                component={Link}
                href='https://github.com/MobilityData/gtfs-realtime-validator'
                target='_blank'
                rel='noopener noreferrer'
              >
                {t('gtfsRtValidator')}
              </Button>
            </AccordionDetails>
          </Accordion>
        )}
        {metricsOptionsEnabled && (
          <>
            <Accordion disableGutters={true} sx={{ boxShadow: 'none' }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls='gtfs-metrics-content'
                id='gtfs-metrics-content'
              >
                <Typography
                  variant={'subtitle1'}
                  sx={{ fontFamily: fontFamily.secondary }}
                >
                  GTFS Metrics
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {gtfsMetricsNavItems.map((item) => (
                  <Button
                    variant='text'
                    sx={mobileNavElementStyle}
                    key={item.title}
                    href={item.target}
                  >
                    {item.title}
                  </Button>
                ))}
              </AccordionDetails>
            </Accordion>
            <Accordion disableGutters={true} sx={{ boxShadow: 'none' }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls='gbfs-metrics-content'
                id='gbfs-metrics-content'
              >
                <Typography
                  variant={'subtitle1'}
                  sx={{ fontFamily: fontFamily.secondary }}
                >
                  GBFS Metrics
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {gbfsMetricsNavItems.map((item) => (
                  <Button
                    variant='text'
                    sx={mobileNavElementStyle}
                    key={item.title}
                    href={item.target}
                  >
                    {item.title}
                  </Button>
                ))}
              </AccordionDetails>
            </Accordion>
          </>
        )}

        {isAuthenticated ? (
          <Accordion disableGutters={true} sx={{ boxShadow: 'none' }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls='account-content'
              id='account-header'
            >
              <Typography
                variant={'subtitle1'}
                sx={{ fontFamily: fontFamily.secondary }}
              >
                Account
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Button
                variant='text'
                sx={mobileNavElementStyle}
                href={ACCOUNT_TARGET}
              >
                Account Details
              </Button>
              <Button
                variant='text'
                sx={mobileNavElementStyle}
                onClick={onLogoutClick}
              >
                Sign Out
              </Button>
            </AccordionDetails>
          </Accordion>
        ) : (
          <Button variant='contained' sx={{ ml: 2 }} href={SIGN_IN_TARGET}>
            Login
          </Button>
        )}
      </List>
      <Divider />
      <Box sx={{ px: 2, py: 1.5 }}>
        <ThemeToggle />
      </Box>
    </Box>
  );
}
