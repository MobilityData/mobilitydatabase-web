'use client';

// This component is currently hardcoded
// To implement actual data fetching / setting once backend APIs are in place

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useTranslations } from 'next-intl';
import { useRemoteConfig } from '../../../context/RemoteConfigProvider';
import { useAuthSession } from '../../../components/AuthSessionProvider';
import { Link, usePathname } from '../../../../i18n/navigation';
import NotificationSettingsDialog, {
  defaultNotificationSettings,
  type NotificationSettings,
} from './NotificationSettingsDialog';

export default function ClientSubscribeControls(): React.ReactElement | null {
  const { config } = useRemoteConfig();
  const { isAuthenticated } = useAuthSession();
  const t = useTranslations('feeds');
  const pathname = usePathname();

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(
    defaultNotificationSettings,
  );

  if (!config.isNotificationsEnabled) {
    return null;
  }

  const handleSubscribeClick = (e: React.MouseEvent<HTMLElement>): void => {
    if (!isAuthenticated) {
      setPopoverAnchor(e.currentTarget);
      return;
    }
    setIsSubscribed(true);
    setSnackbarMessage(t('subscribedToFeed'));
  };

  const handleUnsubscribe = (): void => {
    setMenuAnchor(null);
    setIsSubscribed(false);
    setSnackbarMessage(t('unsubscribedFromFeed'));
  };

  return (
    <>
      <Tooltip
        title={isSubscribed ? 'Manage subscription' : t('subscribe')}
        placement='top'
      >
        <Button
          disableElevation
          color='primary'
          variant={isSubscribed ? 'contained' : 'outlined'}
          onClick={
            isSubscribed
              ? (e) => {
                  setMenuAnchor(e.currentTarget);
                }
              : handleSubscribeClick
          }
          startIcon={isSubscribed ? <CheckIcon /> : <NotificationsIcon />}
          endIcon={isSubscribed ? <ArrowDropDownIcon /> : undefined}
        >
          {isSubscribed ? 'Subscribed' : 'Subscribe'}
        </Button>
      </Tooltip>

      {/* Unauthenticated sign-in nudge */}
      <Popover
        open={Boolean(popoverAnchor)}
        anchorEl={popoverAnchor}
        onClose={() => {
          setPopoverAnchor(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box
          sx={{
            p: 2.5,
            maxWidth: 400,
            backgroundColor: 'background.paper',
            textAlign: 'center',
          }}
        >
          <Typography variant='h6' fontWeight={600}>
            Want to be notified of changes?
          </Typography>
          <Typography variant='subtitle1' color='text.secondary' sx={{ mb: 2 }}>
            Sign in to subscribe to this feed.
          </Typography>
          <Button
            variant='contained'
            disableElevation
            component={Link}
            sx={{ width: '100%' }}
            href={`/sign-in?redirect_to=${encodeURIComponent(pathname)}`}
            onClick={() => {
              setPopoverAnchor(null);
            }}
          >
            Sign In
          </Button>
        </Box>
      </Popover>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setSettingsOpen(true);
          }}
        >
          Notification Settings
        </MenuItem>
        <MenuItem onClick={handleUnsubscribe} sx={{ color: 'error.main' }}>
          Unsubscribe
        </MenuItem>
      </Menu>

      <NotificationSettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
        }}
        onSave={(newSettings) => {
          setSettings(newSettings);
          setSettingsOpen(false);
        }}
        initialSettings={settings}
      />

      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={snackbarMessage !== ''}
        onClose={() => {
          setSnackbarMessage('');
        }}
      >
        <Alert
          onClose={() => {
            setSnackbarMessage('');
          }}
          severity={isSubscribed ? 'success' : 'info'}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
}
