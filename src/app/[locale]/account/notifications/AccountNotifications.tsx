'use client';

import * as React from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Link as LocaleLink } from '../../../../i18n/navigation';
import { useAuthSession } from '../../../components/AuthSessionProvider';
import NotificationSettingsDialog, {
  defaultNotificationSettings,
  type NotificationSettings,
} from '../../../screens/Feed/components/NotificationSettingsDialog';
import { AccountSectionContainer } from '../AccountSectionContainer';
import {
  deleteUserSubscription,
  getUserSubscriptions,
  type NotificationSubscription,
  type SubscriptionFeed,
  updateUserSubscription,
  USER_SUBSCRIPTIONS_SWR_KEY,
} from '../../../services/notification-service';
import { NOTIFICATION_TYPES } from '../../../utils/notificationTypes';

const nonEmpty = (value?: string | null): string | undefined =>
  value != null && value.trim() !== '' ? value : undefined;

const getFeedTitle = (feed: SubscriptionFeed): string => {
  const titlePrefix =
    feed.data_type != null && feed.data_type.trim() !== ''
      ? `[${feed.data_type.toLocaleUpperCase()}]`
      : '';
  const provider = nonEmpty(feed.provider);
  const feedName = nonEmpty(feed.feed_name);
  if (provider != null && feedName != null) {
    return `${titlePrefix} ${provider} - ${feedName}`;
  }
  return `${titlePrefix} ${provider ?? feedName ?? feed.feed_id}`;
};

type SortKey = 'title' | 'type' | 'status' | 'subscribed';

export default function AccountNotifications(): React.ReactElement {
  const t = useTranslations('feeds');
  const { isAuthenticated } = useAuthSession();
  const [orderBy, setOrderBy] = React.useState<SortKey | null>(null);
  const [order, setOrder] = React.useState<'asc' | 'desc'>('asc');

  const getNotificationTypeLabel = (notificationId: string): string => {
    const type = NOTIFICATION_TYPES.find(
      (definition) => definition.id === notificationId,
    );
    return type != null ? t(type.labelKey) : notificationId;
  };

  const getSubscriptionTitle = (
    subscription: NotificationSubscription,
  ): string => {
    const feeds = subscription.feeds ?? [];
    if (feeds.length === 0) {
      return getNotificationTypeLabel(subscription.notification_id);
    }
    return feeds.map(getFeedTitle).join(', ');
  };

  const renderSubscriptionTitle = (
    subscription: NotificationSubscription,
  ): React.ReactNode => {
    const feeds = subscription.feeds ?? [];
    if (feeds.length === 0) {
      return getNotificationTypeLabel(subscription.notification_id);
    }
    return feeds.map((feed, index) => (
      <React.Fragment key={feed.feed_id}>
        {index > 0 && ', '}
        <Link
          component={LocaleLink}
          href={`/feeds/${feed.data_type != null && feed.data_type !== "" ? feed.data_type + "/" : ""}${feed.feed_id}`}
          target='_blank'
          rel='noreferrer'
        >
          {getFeedTitle(feed)}
        </Link>
      </React.Fragment>
    ));
  };

  const handleSortClick = (key: SortKey): void => {
    if (orderBy === key) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(key);
      setOrder('asc');
    }
  };

  const getSortValue = (
    subscription: NotificationSubscription,
    key: SortKey,
  ): string | number => {
    switch (key) {
      case 'title':
        return getSubscriptionTitle(subscription).toLowerCase();
      case 'type':
        return getNotificationTypeLabel(
          subscription.notification_id,
        ).toLowerCase();
      case 'status':
        return subscription.active ? 'active' : 'paused';
      case 'subscribed':
        return new Date(subscription.created_at).getTime();
    }
  };

  const {
    data: notifications = [],
    error: loadError,
    isLoading,
    mutate,
  } = useSWR<NotificationSubscription[]>(
    isAuthenticated ? USER_SUBSCRIPTIONS_SWR_KEY : null,
    getUserSubscriptions,
  );

  const [actionError, setActionError] = React.useState<string | null>(null);
  const [menuState, setMenuState] = React.useState<{
    anchor: HTMLElement;
    id: string;
  } | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [rowSettings, setRowSettings] = React.useState<
    Record<string, NotificationSettings>
  >({});

  const sortedNotifications =
    orderBy === null
      ? notifications
      : [...notifications].sort((a, b) => {
          const valueA = getSortValue(a, orderBy);
          const valueB = getSortValue(b, orderBy);
          const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
          return order === 'asc' ? comparison : -comparison;
        });
  const selectedSubscription =
    menuState !== null
      ? notifications.find((n) => n.id === menuState.id)
      : undefined;
  const isPaused = selectedSubscription?.active === false;

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    id: string,
  ): void => {
    setMenuState({ anchor: event.currentTarget, id });
  };

  const handleMenuClose = (): void => {
    setMenuState(null);
  };

  const handleTogglePause = (): void => {
    if (menuState === null) {
      return;
    }
    const { id } = menuState;
    const subscription = notifications.find((n) => n.id === id);
    handleMenuClose();
    if (subscription === undefined) {
      return;
    }
    const nextActive = !subscription.active;
    const withToggledActive = (
      current: NotificationSubscription[] | undefined,
    ): NotificationSubscription[] =>
      (current ?? []).map((n) =>
        n.id === id ? { ...n, active: nextActive } : n,
      );

    mutate(
      updateUserSubscription(id, nextActive).then((updated) => [updated]),
      {
        optimisticData: withToggledActive,
        rollbackOnError: true,
        populateCache: ([updated], current) =>
          (current ?? []).map((n) => (n.id === id ? updated : n)),
        revalidate: false,
      },
    ).catch(() => {
      setActionError('Failed to update the subscription');
    });
  };

  const handleUnsubscribe = (): void => {
    if (menuState !== null) {
      const { id } = menuState;
      handleMenuClose();
      deleteUserSubscription(id)
        .then(() => mutate())
        .catch(() => {
          setActionError('Failed to unsubscribe');
        });
    }
  };

  const handleSaveSettings = (settings: NotificationSettings): void => {
    if (menuState !== null) {
      setRowSettings((prev) => ({ ...prev, [menuState.id]: settings }));
    }
    setSettingsDialogOpen(false);
  };

  const selectedRowId = menuState?.id;
  const settingsInitial =
    selectedRowId !== undefined
      ? (rowSettings[selectedRowId] ?? defaultNotificationSettings)
      : defaultNotificationSettings;

  return (
    <AccountSectionContainer
      title={'Notifications'}
      subtitle='View and manage the feeds you are subscribed to for update notifications'
      loading={isLoading}
    >
      <Snackbar
        open={actionError !== null}
        autoHideDuration={4000}
        onClose={() => {
          setActionError(null);
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity='error'
          onClose={() => {
            setActionError(null);
          }}
          sx={{ width: '100%' }}
        >
          {actionError}
        </Alert>
      </Snackbar>

      <Box>
        {loadError !== undefined && (
          <Alert severity='error' sx={{ mb: 2 }}>
            Failed to load notification subscriptions.
          </Alert>
        )}
        <TableContainer
          sx={{ backgroundColor: 'background.default', borderRadius: 1 }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 200 }}>
                  <TableSortLabel
                    active={orderBy === 'title'}
                    direction={orderBy === 'title' ? order : 'asc'}
                    onClick={() => {
                      handleSortClick('title');
                    }}
                  >
                    <Typography fontWeight={600}>Title</Typography>
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 250 }}>
                  <TableSortLabel
                    active={orderBy === 'type'}
                    direction={orderBy === 'type' ? order : 'asc'}
                    onClick={() => {
                      handleSortClick('type');
                    }}
                  >
                    <Typography fontWeight={600}>Type</Typography>
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 110 }}>
                  <TableSortLabel
                    active={orderBy === 'status'}
                    direction={orderBy === 'status' ? order : 'asc'}
                    onClick={() => {
                      handleSortClick('status');
                    }}
                  >
                    <Typography fontWeight={600}>Status</Typography>
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 140 }}>
                  <TableSortLabel
                    active={orderBy === 'subscribed'}
                    direction={orderBy === 'subscribed' ? order : 'asc'}
                    onClick={() => {
                      handleSortClick('subscribed');
                    }}
                  >
                    <Typography fontWeight={600}>Subscribed</Typography>
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ width: 56 }}>
                  <Typography fontWeight={600}></Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedNotifications.map((n) => (
                <TableRow key={n.id} hover>
                  <TableCell>{renderSubscriptionTitle(n)}</TableCell>
                  <TableCell>
                    {getNotificationTypeLabel(n.notification_id)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={n.active ? 'Active' : 'Paused'}
                      color={n.active ? 'success' : 'default'}
                      size='small'
                      variant='outlined'
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(n.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <IconButton
                      size='small'
                      aria-label={`Actions for ${n.notification_id}`}
                      onClick={(e) => {
                        handleMenuOpen(e, n.id);
                      }}
                    >
                      <MoreVertIcon fontSize='small' />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {notifications.length === 0 && loadError === undefined && (
                <TableRow>
                  <TableCell colSpan={5} align='center'>
                    <Typography color='text.secondary' sx={{ py: 4 }}>
                      No active subscriptions
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Menu
          anchorEl={menuState?.anchor}
          open={menuState !== null}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={handleTogglePause}>
            {isPaused ? 'Resume Notifications' : 'Pause Notifications'}
          </MenuItem>
          <MenuItem onClick={handleUnsubscribe} sx={{ color: 'error.main' }}>
            Unsubscribe
          </MenuItem>
        </Menu>

        <NotificationSettingsDialog
          open={settingsDialogOpen}
          onClose={() => {
            setSettingsDialogOpen(false);
          }}
          onSave={handleSaveSettings}
          initialSettings={settingsInitial}
        />
      </Box>
    </AccountSectionContainer>
  );
}
