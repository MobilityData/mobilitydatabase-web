'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  ListSubheader,
  Toolbar,
  Typography,
  Button,
  Menu,
  MenuItem,
  Select,
  Alert,
  AlertTitle,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import {
  navigationAccountItem,
  SIGN_IN_TARGET,
  buildNavigationItems,
  gtfsMetricsNavItems,
  gbfsMetricsNavItems,
} from '../constants/Navigation';
import type NavigationItem from '../interface/Navigation';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { OpenInNew } from '@mui/icons-material';
import { useRemoteConfig } from '../context/RemoteConfigProvider';
import { fontFamily } from '../Theme';
import { defaultRemoteConfigValues } from '../interface/RemoteConfig';
import { animatedButtonStyling } from './Header.style';
import ThemeToggle from './ThemeToggle';
import HeaderSearchBar from './HeaderSearchBar';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { useAuthSession } from './AuthSessionProvider';

// Lazy load components not needed for initial render
const LogoutConfirmModal = dynamic(
  async () => await import('./LogoutConfirmModal'),
  {
    ssr: false,
  },
);
const DrawerContent = dynamic(
  async () => await import('./HeaderMobileDrawer'),
  {
    ssr: false,
  },
);

// Hook to safely access search params only on client
function useClientSearchParams(): URLSearchParams | null {
  const [searchParams, setSearchParams] =
    React.useState<URLSearchParams | null>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setSearchParams(new URLSearchParams(window.location.search));
    }
  }, []);

  return searchParams;
}

export default function DrawerAppBar(): React.ReactElement {
  const {
    email: userEmail,
    isAuthenticated,
    displayName: userDisplayName,
  } = useAuthSession();
  const clientSearchParams = useClientSearchParams();
  const hasTransitFeedsRedirectParam =
    clientSearchParams?.get('utm_source') === 'transitfeeds';

  const { colorScheme } = useColorScheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [hasTransitFeedsRedirect, setHasTransitFeedsRedirect] =
    React.useState(false);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('');
  const [navigationItems, setNavigationItems] = React.useState<
    NavigationItem[]
  >(buildNavigationItems(defaultRemoteConfigValues));
  const locale = useLocale();
  const { config } = useRemoteConfig();
  const tCommon = useTranslations('common');

  React.useEffect(() => {
    if (hasTransitFeedsRedirectParam) {
      setHasTransitFeedsRedirect(true);
    }
  }, [hasTransitFeedsRedirectParam]);

  React.useEffect(() => {
    setActiveTab(pathname ?? '');
  }, [pathname]);

  React.useEffect(() => {
    setNavigationItems(buildNavigationItems(config));
  }, [config]);

  const router = useRouter();

  const handleDrawerToggle = (): void => {
    setMobileOpen((prevState) => !prevState);
  };

  const handleNavigation = (navigationItem: NavigationItem | string): void => {
    if (typeof navigationItem === 'string') router.push(navigationItem);
    else {
      if (navigationItem.external === true)
        window.open(navigationItem.target, '_blank', 'noopener noreferrer');
      else router.push(navigationItem.target);
    }
    setMobileOpen(false);
  };

  const handleLogoutClick = (): void => {
    setOpenDialog(true);
    setAccountAnchorEl(null);
  };

  const container =
    typeof window !== 'undefined' ? () => window.document.body : undefined;

  const [validatorAnchorEl, setValidatorAnchorEl] =
    React.useState<null | HTMLElement>(null);
  const validatorCloseTimer =
    React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleValidatorOpen = (e: React.MouseEvent<HTMLElement>): void => {
    clearTimeout(validatorCloseTimer.current);
    setValidatorAnchorEl(e.currentTarget);
  };

  const handleValidatorClose = (): void => {
    validatorCloseTimer.current = setTimeout(() => {
      setValidatorAnchorEl(null);
    }, 80);
  };

  const [accountAnchorEl, setAccountAnchorEl] =
    React.useState<null | HTMLElement>(null);
  const accountCloseTimer =
    React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleAccountOpen = (e: React.MouseEvent<HTMLElement>): void => {
    clearTimeout(accountCloseTimer.current);
    setAccountAnchorEl(e.currentTarget);
  };

  const handleAccountClose = (): void => {
    accountCloseTimer.current = setTimeout(() => {
      setAccountAnchorEl(null);
    }, 80);
  };

  React.useEffect(() => {
    return () => {
      clearTimeout(validatorCloseTimer.current);
      clearTimeout(accountCloseTimer.current);
    };
  }, []);

  const [isSearchOpen, setIsSearchOpen] = React.useState(false);

  const metricsOptionsEnabled =
    config.enableMetrics || userEmail?.endsWith('mobilitydata.org') === true;

  return (
    <Box
      sx={{
        display: 'flex',
        height: hasTransitFeedsRedirect ? '115px' : '64px',
        mb: { xs: 2, md: 4 },
      }}
    >
      <AppBar
        component='nav'
        color='inherit'
        elevation={0}
        sx={(theme) => ({
          backgroundColor: theme.vars.palette.background.paper,
          fontFamily: fontFamily.secondary,
        })}
      >
        <Box
          id='search-background'
          aria-hidden='true'
          sx={(theme) => ({
            position: 'absolute',
            inset: 0,
            bgcolor: theme.vars.palette.text.disabled,
            opacity: isSearchOpen ? 1 : 0,
            zIndex: 1,
            pointerEvents: isSearchOpen ? 'auto' : 'none',
            transition: 'opacity 0.25s ease',
          })}
        />
        <Toolbar
          sx={(theme) => ({
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: theme.breakpoints.values.xl,
            mx: 'auto',
            position: 'relative',
          })}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              color='inherit'
              aria-label={tCommon('openDrawer')}
              edge='start'
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Link
              href={'/'}
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
              className='btn-link'
              aria-label={tCommon('mobilityDatabaseHome')}
            >
              <Image
                src={
                  colorScheme !== 'dark'
                    ? '/assets/MOBILTYDATA_logo_light_blue_M.png'
                    : '/assets/MOBILTYDATA_logo_purple_M.png'
                }
                alt='MobilityData logo'
                width={45 * 1.05} // aspect ratio of the logo is slightly off, adjust width to prevent layout shift between themes
                height={45}
                priority
                fetchPriority='high'
              />
              <Typography
                color={'primary'}
                sx={{
                  ml: 1,
                  fontWeight: 700,
                  fontSize: '1.5rem',
                  display: { xs: 'none', md: 'block' },
                }}
              >
                MobilityDatabase
              </Typography>
            </Link>
          </Box>

          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <HeaderSearchBar onOpenChange={setIsSearchOpen} />
            {navigationItems.map((item) => (
              <Link
                data-cy={
                  'header-' + item.title.toLowerCase().replace(/\s+/g, '-')
                }
                href={item.external === true ? item.target : '/' + item.target}
                key={item.title}
                target={item.external === true ? '_blank' : '_self'}
                rel={item.external === true ? 'noopener noreferrer' : ''}
              >
                <Button
                  sx={(theme) => ({
                    ...animatedButtonStyling(theme),
                    color: theme.vars.palette.text.primary,
                  })}
                  variant={'text'}
                  endIcon={item.external === true ? <OpenInNew /> : null}
                  className={
                    activeTab.includes('/' + item.target) ? 'active' : ''
                  }
                >
                  {item.title}
                </Button>
              </Link>
            ))}

            <Box
              component='span'
              onMouseEnter={handleValidatorOpen}
              onMouseLeave={handleValidatorClose}
              sx={{ display: 'inline-flex' }}
            >
              <Button
                aria-controls='validator-menu'
                aria-haspopup='true'
                aria-expanded={validatorAnchorEl !== null}
                endIcon={<ArrowDropDownIcon />}
                sx={(theme) => ({
                  ...animatedButtonStyling(theme),
                  color: theme.vars.palette.text.primary,
                })}
                className={
                  activeTab.includes('validator') ? 'active short' : ''
                }
              >
                {tCommon('validators')}
              </Button>
              <Menu
                id='validator-menu'
                anchorEl={validatorAnchorEl}
                open={validatorAnchorEl !== null}
                onClose={() => {
                  setValidatorAnchorEl(null);
                }}
                disableScrollLock
                disableRestoreFocus
                sx={{ pointerEvents: 'none' }}
                slotProps={{
                  paper: {
                    onMouseEnter: () => {
                      clearTimeout(validatorCloseTimer.current);
                    },
                    onMouseLeave: handleValidatorClose,
                    sx: { pointerEvents: 'auto' },
                  },
                }}
              >
                <MenuItem
                  component={'a'}
                  href='https://gtfs-validator.mobilitydata.org/'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  {tCommon('gtfsValidator')}
                  <OpenInNew fontSize='small' sx={{ ml: 0.5 }} />
                </MenuItem>
                <MenuItem
                  component={'a'}
                  href='https://github.com/MobilityData/gtfs-realtime-validator'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  {tCommon('gtfsRtValidator')}
                  <OpenInNew fontSize='small' sx={{ ml: 0.5 }} />
                </MenuItem>
                {config.gbfsValidator ? (
                  <MenuItem
                    onClick={() => {
                      setValidatorAnchorEl(null);
                      handleNavigation('/gbfs-validator');
                    }}
                  >
                    {tCommon('gbfsValidator')}
                  </MenuItem>
                ) : (
                  <MenuItem
                    component={'a'}
                    href='https://gbfs-validator.mobilitydata.org/'
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {tCommon('gbfsValidator')}
                    <OpenInNew fontSize='small' sx={{ ml: 0.5 }} />
                  </MenuItem>
                )}
              </Menu>
            </Box>

            {isAuthenticated ? (
              <Box
                component='span'
                onMouseEnter={handleAccountOpen}
                onMouseLeave={handleAccountClose}
                sx={{ display: 'inline-flex' }}
              >
                <IconButton
                  aria-controls='account-menu'
                  aria-haspopup='true'
                  aria-expanded={accountAnchorEl !== null}
                  aria-label={tCommon('accountMenu')}
                  size='small'
                  data-cy='accountHeader'
                  onClick={() => {
                    handleNavigation(navigationAccountItem);
                  }}
                >
                  <Avatar
                    sx={(theme) => ({
                      width: 32,
                      height: 32,
                      fontSize: theme.typography.body2.fontSize,
                      bgcolor: theme.vars.palette.primary.main,
                    })}
                  >
                    {(userDisplayName ?? userEmail)?.[0]?.toUpperCase() ?? ''}
                  </Avatar>
                </IconButton>
                <Menu
                  id='account-menu'
                  anchorEl={accountAnchorEl}
                  open={accountAnchorEl !== null}
                  onClose={() => {
                    setAccountAnchorEl(null);
                  }}
                  disableScrollLock
                  disableRestoreFocus
                  sx={{ pointerEvents: 'none' }}
                  slotProps={{
                    paper: {
                      onMouseEnter: () => {
                        clearTimeout(accountCloseTimer.current);
                      },
                      onMouseLeave: handleAccountClose,
                      sx: { pointerEvents: 'auto', minWidth: 200 },
                    },
                  }}
                >
                  <MenuItem
                    data-cy='accountDetailsHeader'
                    onClick={() => {
                      setAccountAnchorEl(null);
                      handleNavigation(navigationAccountItem);
                    }}
                  >
                    {tCommon('accountDetails')}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setAccountAnchorEl(null);
                      handleLogoutClick();
                    }}
                  >
                    {tCommon('signOut')}
                  </MenuItem>
                  {metricsOptionsEnabled && [
                    <Divider key='metrics-divider' />,
                    <ListSubheader
                      key='metrics-header'
                      sx={{ lineHeight: '32px' }}
                    >
                      {tCommon('metricsAdminOnly')}
                    </ListSubheader>,
                    <ListSubheader
                      key='gtfs-header'
                      sx={{
                        lineHeight: '28px',
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                      }}
                    >
                      GTFS
                    </ListSubheader>,
                    ...gtfsMetricsNavItems.map((item) => (
                      <MenuItem
                        key={item.title}
                        onClick={() => {
                          setAccountAnchorEl(null);
                          handleNavigation(item.target);
                        }}
                      >
                        {item.title}
                      </MenuItem>
                    )),
                    <ListSubheader
                      key='gbfs-header'
                      sx={{
                        lineHeight: '28px',
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                      }}
                    >
                      GBFS
                    </ListSubheader>,
                    ...gbfsMetricsNavItems.map((item) => (
                      <MenuItem
                        key={'gbfs-header-' + item.title}
                        onClick={() => {
                          setAccountAnchorEl(null);
                          handleNavigation(item.target);
                        }}
                      >
                        {item.title}
                      </MenuItem>
                    )),
                  ]}
                </Menu>
              </Box>
            ) : (
              <Button
                variant='contained'
                color='primary'
                sx={{ fontFamily: fontFamily.secondary, ml: { md: 1, lg: 2 } }}
                href={SIGN_IN_TARGET}
                component={Link}
                size='small'
              >
                {tCommon('login')}
              </Button>
            )}

            <Box sx={{ ml: 2, display: 'inline-block' }}>
              <ThemeToggle></ThemeToggle>
            </Box>

            {/* Testing language tool -> to revisit */}
            {config.enableLanguageToggle && (
              <Select
                value={locale}
                onChange={(e) => {
                  const newLocale = e.target.value;
                  const currentHost = window.location.host;
                  const currentProtocol = window.location.protocol;
                  const currentPath =
                    window.location.pathname + window.location.search;

                  let newHost = currentHost;
                  if (newLocale === 'fr') {
                    if (!currentHost.startsWith('fr.')) {
                      newHost = 'fr.' + currentHost;
                    }
                  } else {
                    if (currentHost.startsWith('fr.')) {
                      newHost = currentHost.replace('fr.', '');
                    }
                  }

                  if (newHost !== currentHost) {
                    window.location.href = `${currentProtocol}//${newHost}${currentPath}`;
                  }
                }}
                variant='standard'
                inputProps={{ 'aria-label': tCommon('languageSelect') }}
              >
                <MenuItem value={'en'}>EN</MenuItem>
                <MenuItem value={'fr'}>FR</MenuItem>
              </Select>
            )}
          </Box>
        </Toolbar>

        {hasTransitFeedsRedirect && (
          <Alert
            severity='warning'
            onClose={() => {
              setHasTransitFeedsRedirect(false);
              if (hasTransitFeedsRedirectParam && clientSearchParams != null) {
                // Remove utm_source from URL
                const newSearchParams = new URLSearchParams(clientSearchParams);
                newSearchParams.delete('utm_source');
                const newPath = `${pathname}?${newSearchParams.toString()}`;
                router.replace(newPath);
              }
            }}
            sx={{ '.MuiAlert-message': { pb: { xs: 0, md: 1 } } }}
          >
            <AlertTitle>{tCommon('transitFeedsRedirectTitle')}</AlertTitle>
            <Box
              component={'span'}
              sx={{ display: { xs: 'none', md: 'block' } }}
            >
              {tCommon('transitFeedsRedirectBody')}
            </Box>
          </Alert>
        )}
      </AppBar>

      <nav>
        <Drawer
          container={container}
          variant='temporary'
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: '240px',
            },
          }}
        >
          <DrawerContent
            isAuthenticated={isAuthenticated}
            onLogoutClick={handleLogoutClick}
            navigationItems={navigationItems}
            metricsOptionsEnabled={metricsOptionsEnabled}
            onClose={handleDrawerToggle}
          />
        </Drawer>
      </nav>
      <LogoutConfirmModal
        openDialog={openDialog}
        setOpenDialog={setOpenDialog}
      />
    </Box>
  );
}
