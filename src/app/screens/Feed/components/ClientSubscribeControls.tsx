'use client';

import { useState } from 'react';
import useSWR from 'swr';
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
import LockIcon from '@mui/icons-material/Lock';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useTranslations } from 'next-intl';
import { useRemoteConfig } from '../../../context/RemoteConfigProvider';
import { useUserFeatureFlags } from '../../../hooks/useUserFeatureFlags';
import { useAuthSession } from '../../../components/AuthSessionProvider';
import { Link, usePathname } from '../../../../i18n/navigation';
import {
  createUserSubscription,
  deleteUserSubscription,
  getUserSubscriptions,
  type NotificationSubscription,
  USER_SUBSCRIPTIONS_SWR_KEY,
} from '../../../services/notification-service';
import { FEED_NOTIFICATION_TYPE_IDS } from '../../../utils/notificationTypes';
import NotificationSettingsDialog, {
  type NotificationSettings,
} from './NotificationSettingsDialog';

interface ClientSubscribeControlsProps {
  feedId: string;
}

// This allows us to have an instant UI showing the user is subscribed
function buildOptimisticSubscriptions(
  feedId: string,
): NotificationSubscription[] {
  const now = new Date().toISOString();
  return FEED_NOTIFICATION_TYPE_IDS.map((notificationId) => ({
    id: `optimistic-${feedId}-${notificationId}`,
    user_id: '',
    notification_id: notificationId,
    active: true,
    created_at: now,
    feeds: [{ feed_id: feedId }],
  }));
}

function withoutIds(
  subscriptions: NotificationSubscription[] | undefined,
  ids: string[],
): NotificationSubscription[] {
  return (subscriptions ?? []).filter(
    (subscription) => !ids.includes(subscription.id),
  );
}

/**
 * Creates one subscription per notification type for the feed. Resolves with
 * whichever succeeded; only throws if every request failed, so a partial
 * success still lands in the cache instead of rolling back everything.
 */
async function subscribeToAllNotificationTypes(
  feedId: string,
): Promise<NotificationSubscription[]> {
  const results = await Promise.allSettled(
    FEED_NOTIFICATION_TYPE_IDS.map((notificationId) =>
      createUserSubscription({
        notification_id: notificationId,
        feed_ids: [feedId],
      }),
    ),
  );
  const created = results
    .filter(
      (result): result is PromiseFulfilledResult<NotificationSubscription> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value);

  if (created.length === 0) {
    throw new Error('Failed to subscribe to any notification type');
  }
  return created;
}

export default function ClientSubscribeControls({
  feedId,
}: ClientSubscribeControlsProps): React.ReactElement | null {
  const { config } = useRemoteConfig();
  const { isAuthenticated } = useAuthSession();
  const {
    flags: { isNotificationsEnabled },
    isResolved: areFlagsResolved,
  } = useUserFeatureFlags();
  const t = useTranslations('feeds');
  const pathname = usePathname();

  // Entitlement is genuinely unknown until the flags resolve — on statically
  // rendered routes they arrive as defaults and are re-fetched client-side.
  // Showing the lock in that window would be a wrong answer the user can click.
  const isAccessPending = isAuthenticated && !areFlagsResolved;
  const hasNoAccess =
    !isAccessPending && (!isAuthenticated || !isNotificationsEnabled);

  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<
    'success' | 'info' | 'error'
  >('info');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [accessPopoverAnchor, setAccessPopoverAnchor] =
    useState<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const notify = (
    severity: 'success' | 'info' | 'error',
    messageKey: Parameters<typeof t>[0],
  ): void => {
    setSnackbarSeverity(severity);
    setSnackbarMessage(t(messageKey));
  };

  const { data: subscriptions, mutate: mutateSubscriptions } = useSWR<
    NotificationSubscription[]
  >(isAuthenticated ? USER_SUBSCRIPTIONS_SWR_KEY : null, getUserSubscriptions);

  const feedSubscriptions = (subscriptions ?? []).filter(
    (subscription) =>
      FEED_NOTIFICATION_TYPE_IDS.includes(subscription.notification_id) &&
      subscription.feeds?.some((feed) => feed.feed_id === feedId),
  );
  const isSubscribed = feedSubscriptions.some(
    (subscription) => subscription.active,
  );

  const dialogInitialSettings: NotificationSettings = {
    changeTypes: feedSubscriptions
      .filter((subscription) => subscription.active)
      .map((subscription) => subscription.notification_id),
  };

  if (!config.isNotificationsEnabled) {
    return null;
  }

  const handleSubscribeClick = (e: React.MouseEvent<HTMLElement>): void => {
    if (!isAuthenticated) {
      setPopoverAnchor(e.currentTarget);
      return;
    }
    if (!isNotificationsEnabled) {
      setAccessPopoverAnchor(e.currentTarget);
      return;
    }

    const optimisticSubscriptions = buildOptimisticSubscriptions(feedId);
    const optimisticIds = optimisticSubscriptions.map(
      (subscription) => subscription.id,
    );

    mutateSubscriptions(subscribeToAllNotificationTypes(feedId), {
      optimisticData: (current) => [
        ...(current ?? []),
        ...optimisticSubscriptions,
      ],
      rollbackOnError: true,
      populateCache: (created, current) => [
        ...withoutIds(current, optimisticIds),
        ...created,
      ],
      revalidate: false,
    })
      .then((created) => {
        const allSucceeded =
          (created?.length ?? 0) === FEED_NOTIFICATION_TYPE_IDS.length;
        notify(
          allSucceeded ? 'success' : 'error',
          allSucceeded ? 'subscribedToFeed' : 'subscribePartialFailure',
        );
      })
      .catch(() => {
        notify('error', 'subscribeFailed');
      });
  };

  const handleUnsubscribe = (): void => {
    setMenuAnchor(null);

    const idsToRemove = feedSubscriptions.map(
      (subscription) => subscription.id,
    );

    mutateSubscriptions(
      Promise.all(
        feedSubscriptions.map((subscription) =>
          deleteUserSubscription(subscription.id),
        ),
      ).then(() => undefined),
      {
        optimisticData: (current) => withoutIds(current, idsToRemove),
        rollbackOnError: true,
        populateCache: (_, current) => withoutIds(current, idsToRemove),
        revalidate: false,
      },
    )
      .then(() => {
        notify('info', 'unsubscribedFromFeed');
      })
      .catch(() => {
        notify('error', 'unsubscribeFailed');
      });
  };

  return (
    <>
      <Tooltip
        title={isSubscribed ? 'Manage subscription' : t('subscribe')}
        placement='top'
      >
        <Button
          disableElevation
          disabled={isAccessPending}
          color={hasNoAccess ? 'inherit' : 'primary'}
          variant={isSubscribed ? 'contained' : 'outlined'}
          onClick={
            isSubscribed
              ? (e) => {
                  setMenuAnchor(e.currentTarget);
                }
              : handleSubscribeClick
          }
          startIcon={
            isSubscribed ? (
              <CheckIcon />
            ) : hasNoAccess ? (
              <LockIcon />
            ) : (
              <NotificationsIcon />
            )
          }
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

      {/* Authenticated but not entitled to the feature nudge */}
      <Popover
        open={Boolean(accessPopoverAnchor)}
        anchorEl={accessPopoverAnchor}
        onClose={() => {
          setAccessPopoverAnchor(null);
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
            Subscriptions are in early access
          </Typography>
          <Typography
            variant='subtitle1'
            color='text.secondary'
            sx={{ my: 1, lineHeight: 1.5 }}
          >
            We&apos;re rolling out feed subscriptions gradually. Request access
            and we&apos;ll notify you when it&apos;s your turn.
          </Typography>
          <Button
            variant='contained'
            disableElevation
            component={Link}
            sx={{ width: '100%' }}
            href='https://docs.google.com/forms/d/e/1FAIpQLSfJQA237kboYWRy5BALkXC6tvvFiAZQhZifBaSp3W30iBTk-A/viewform?usp=dialog'
            target='_blank'
            rel='nofollow'
            onClick={() => {
              setAccessPopoverAnchor(null);
            }}
          >
            Request Access
          </Button>
          <Button
            variant='text'
            component={Link}
            href='https://mobilitydata.org/members/'
            target='_blank'
            rel='nofollow'
          >
            Learn about membership
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
        <MenuItem component={Link} href='/account/notifications'>
          View All Notifications
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
        onSave={() => {
          setSettingsOpen(false);
        }}
        initialSettings={dialogInitialSettings}
        feedId={feedId}
        existingSubscriptions={feedSubscriptions}
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
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
}
