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
  type NotificationSettings,
} from '../../../screens/Feed/components/NotificationSettingsDialog';
import { AccountSectionContainer } from '../AccountSectionContainer';
import {
  deleteUserSubscription,
  getUserSubscriptions,
  type NotificationSubscription,
  removeFeedsFromUserSubscription,
  updateUserSubscription,
  USER_SUBSCRIPTIONS_SWR_KEY,
} from '../../../services/notification-service';
import { withoutFeed } from '../../../utils/subscriptionCache';
import {
  FEED_NOTIFICATION_TYPE_IDS,
  NOTIFICATION_TYPES,
} from '../../../utils/notificationTypes';
import {
  getFeedTitle,
  groupSubscriptionsByFeed,
  type NotificationRow,
} from './lib/groupSubscriptions';

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

  const getNotificationTypesLabel = (row: NotificationRow): string =>
    row.notificationIds.map(getNotificationTypeLabel).join(', ');

  const getRowTitle = (row: NotificationRow): string =>
    row.feed != null ? getFeedTitle(row.feed) : getNotificationTypesLabel(row);

  const renderRowTitle = (row: NotificationRow): React.ReactNode => {
    if (row.feed == null) {
      return getNotificationTypesLabel(row);
    }
    const { feed } = row;
    return (
      <Link
        component={LocaleLink}
        href={`/feeds/${feed.data_type != null && feed.data_type !== '' ? feed.data_type + '/' : ''}${feed.feed_id}`}
        target='_blank'
        rel='noreferrer'
      >
        {getFeedTitle(feed)}
      </Link>
    );
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
    row: NotificationRow,
    key: SortKey,
  ): string | number => {
    switch (key) {
      case 'title':
        return getRowTitle(row).toLowerCase();
      case 'type':
        return getNotificationTypesLabel(row).toLowerCase();
      case 'status':
        return row.active ? 'active' : 'paused';
      case 'subscribed':
        return new Date(row.createdAt).getTime();
    }
  };

  const {
    data: notifications,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR<NotificationSubscription[]>(
    isAuthenticated ? USER_SUBSCRIPTIONS_SWR_KEY : null,
    getUserSubscriptions,
  );

  // Keyed on the SWR data reference so row objects stay stable across
  // unrelated re-renders (the settings dialog resets when its props change).
  const rows = React.useMemo(
    () => groupSubscriptionsByFeed(notifications ?? []),
    [notifications],
  );

  const [actionError, setActionError] = React.useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  // Kept after the menu closes so its items don't change while it fades out.
  const [menuRowKey, setMenuRowKey] = React.useState<string | null>(null);
  const [settingsRowKey, setSettingsRowKey] = React.useState<string | null>(
    null,
  );

  const sortedRows =
    orderBy === null
      ? rows
      : [...rows].sort((a, b) => {
          const valueA = getSortValue(a, orderBy);
          const valueB = getSortValue(b, orderBy);
          const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
          return order === 'asc' ? comparison : -comparison;
        });
  const selectedRow =
    menuRowKey !== null
      ? rows.find((row) => row.key === menuRowKey)
      : undefined;
  const isPaused = selectedRow?.active === false;

  const settingsRow =
    settingsRowKey !== null
      ? rows.find((row) => row.key === settingsRowKey)
      : undefined;
  const settingsInitial = React.useMemo<NotificationSettings>(
    () => ({
      changeTypes: (settingsRow?.subscriptions ?? [])
        .filter(
          (s) =>
            s.active && FEED_NOTIFICATION_TYPE_IDS.includes(s.notification_id),
        )
        .map((s) => s.notification_id),
    }),
    [settingsRow],
  );

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    key: string,
  ): void => {
    setMenuAnchor(event.currentTarget);
    setMenuRowKey(key);
  };

  const handleMenuClose = (): void => {
    setMenuAnchor(null);
  };

  const handleOpenSettings = (): void => {
    if (selectedRow !== undefined) {
      setSettingsRowKey(selectedRow.key);
    }
    handleMenuClose();
  };

  // Only offered for global rows: `active` is per notification type and is
  // shared by every feed in it, so a single feed can't be paused.
  const handleTogglePause = (): void => {
    handleMenuClose();
    if (selectedRow === undefined || selectedRow.feed != null) {
      return;
    }
    const nextActive = !selectedRow.active;
    const ids = selectedRow.subscriptions
      .filter((s) => s.active !== nextActive)
      .map((s) => s.id);
    if (ids.length === 0) {
      return;
    }

    mutate(
      Promise.all(ids.map((id) => updateUserSubscription(id, nextActive))),
      {
        optimisticData: (current) =>
          (current ?? []).map((n) =>
            ids.includes(n.id) ? { ...n, active: nextActive } : n,
          ),
        rollbackOnError: true,
        populateCache: (updated, current) =>
          (current ?? []).map((n) => updated.find((u) => u.id === n.id) ?? n),
        revalidate: false,
      },
    ).catch(() => {
      setActionError('Failed to update the subscription');
      // Some updates may have succeeded before the failure; resync.
      void mutate();
    });
  };

  const handleUnsubscribe = (): void => {
    handleMenuClose();
    if (selectedRow === undefined) {
      return;
    }
    const { feed, subscriptions } = selectedRow;
    if (feed == null) {
      Promise.all(subscriptions.map((s) => deleteUserSubscription(s.id)))
        .then(() => mutate())
        .catch(() => {
          setActionError('Failed to unsubscribe');
          void mutate();
        });
      return;
    }

    // A feed's subscriptions are shared with the user's other feeds of the
    // same type, so remove just this feed rather than deleting them.
    const ids = subscriptions.map((s) => s.id);
    mutate(
      Promise.all(
        ids.map((id) => removeFeedsFromUserSubscription(id, [feed.feed_id])),
      ).then(() => undefined),
      {
        optimisticData: (current) =>
          withoutFeed(current ?? [], ids, feed.feed_id),
        rollbackOnError: true,
        populateCache: (_, current) =>
          withoutFeed(current ?? [], ids, feed.feed_id),
        revalidate: false,
      },
    ).catch(() => {
      setActionError('Failed to unsubscribe');
      // Some removals may have succeeded before the failure; resync.
      void mutate();
    });
  };

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
              {sortedRows.map((row) => (
                <TableRow key={row.key} hover>
                  <TableCell>{renderRowTitle(row)}</TableCell>
                  <TableCell>{getNotificationTypesLabel(row)}</TableCell>
                  <TableCell>
                    <Chip
                      label={row.active ? 'Active' : 'Paused'}
                      color={row.active ? 'success' : 'default'}
                      size='small'
                      variant='outlined'
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(row.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <IconButton
                      size='small'
                      aria-label={`Actions for ${getRowTitle(row)}`}
                      onClick={(e) => {
                        handleMenuOpen(e, row.key);
                      }}
                    >
                      <MoreVertIcon fontSize='small' />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && loadError === undefined && (
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
          anchorEl={menuAnchor}
          open={menuAnchor !== null}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {selectedRow?.feed != null ? (
            <MenuItem onClick={handleOpenSettings}>
              Notification Settings
            </MenuItem>
          ) : (
            <MenuItem onClick={handleTogglePause}>
              {isPaused ? 'Resume Notifications' : 'Pause Notifications'}
            </MenuItem>
          )}
          <MenuItem onClick={handleUnsubscribe} sx={{ color: 'error.main' }}>
            Unsubscribe
          </MenuItem>
        </Menu>

        <NotificationSettingsDialog
          open={settingsRow !== undefined}
          onClose={() => {
            setSettingsRowKey(null);
          }}
          onSave={() => {
            setSettingsRowKey(null);
          }}
          initialSettings={settingsInitial}
          feedId={settingsRow?.feed?.feed_id}
          existingSubscriptions={settingsRow?.subscriptions}
        />
      </Box>
    </AccountSectionContainer>
  );
}
