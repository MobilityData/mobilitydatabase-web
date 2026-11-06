'use client';

import * as React from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined';
import {
  Alert,
  Button,
  CircularProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { ContentBox } from '../../../components/ContentBox';
import { useAuthSession } from '../../../components/AuthSessionProvider';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { anonymousLogin } from '../../../store/profile-reducer';
import {
  ACCOUNT_NOTIFICATIONS_TARGET,
  SIGN_IN_TARGET,
} from '../../../constants/Navigation';
import {
  getSubscriptionById,
  unsubscribeBySubscriptionId,
  type UnsubscribeScope,
} from '../../../services/notification-service';
import { Link } from '../../../../i18n/navigation';
import {
  getNotificationTypeLabelKey,
  isValidSubscriptionId,
  resolveViewCopy,
  toSubscriptionLookup,
  toUnsubscribeResult,
  type UnsubscribeResult,
} from './lib/unsubscribe';

export default function UnsubscribeContent(): React.ReactElement {
  const t = useTranslations('unsubscribe');
  const tFeeds = useTranslations('feeds');
  const theme = useTheme();
  const searchParams = useSearchParams();
  const { isAuthReady } = useAuthSession();
  const isRegistered = useAppSelector(
    (state) => state.userProfile.status === 'registered',
  );
  // Set when anonymous sign-in failed or was skipped; with no Firebase user
  // the lookup below would otherwise wait forever.
  const anonymousLoginError = useAppSelector(
    (state) => state.userProfile.errors.AnonymousLogin != null,
  );
  const dispatch = useAppDispatch();
  const [isPending, startTransition] = React.useTransition();
  const [pendingScope, setPendingScope] =
    React.useState<UnsubscribeScope | null>(null);
  const [result, setResult] = React.useState<{
    scope: UnsubscribeScope;
    outcome: UnsubscribeResult;
  } | null>(null);

  const idParam = searchParams.get('id');
  const subscriptionId = isValidSubscriptionId(idParam) ? idParam : undefined;

  // Calls need a Firebase user; signed-out visitors get an anonymous one
  // shortly after load, so the request waits for it.
  const { data, error, mutate } = useSWR(
    subscriptionId !== undefined && isAuthReady
      ? ['subscription', subscriptionId]
      : null,
    async ([, id]: [string, string]) => await getSubscriptionById(id),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    },
  );

  const lookup = toSubscriptionLookup({
    subscriptionId,
    data,
    error,
    authFailed: !isAuthReady && anonymousLoginError,
  });
  const view = resolveViewCopy(lookup, result);

  // Types the app doesn't label yet fall back to their raw id.
  let notificationType = '';
  if (lookup.status === 'found') {
    const labelKey = getNotificationTypeLabelKey(lookup.notificationId);
    notificationType =
      labelKey !== undefined ? tFeeds(labelKey) : lookup.notificationId;
  }

  // Signed-out (or not yet registered) users go through sign-in, which sends
  // them on to the notifications page once their account is ready.
  const manageHref = isRegistered
    ? ACCOUNT_NOTIFICATIONS_TARGET
    : `${SIGN_IN_TARGET}?redirect_to=${encodeURIComponent(
        ACCOUNT_NOTIFICATIONS_TARGET,
      )}`;

  // The subscription the buttons act on, while the user can still act.
  const actionable =
    lookup.status === 'found' && view.status === 'ready' ? lookup : null;

  const handleUnsubscribe = (scope: UnsubscribeScope): void => {
    if (subscriptionId === undefined) {
      return;
    }
    setPendingScope(scope);
    startTransition(async () => {
      let outcome: UnsubscribeResult;
      try {
        outcome = toUnsubscribeResult(
          await unsubscribeBySubscriptionId(subscriptionId, scope),
        );
      } catch {
        outcome = 'error';
      }
      setResult({ scope, outcome });
    });
  };

  const spinnerFor = (scope: UnsubscribeScope): React.ReactNode =>
    isPending && pendingScope === scope ? (
      <CircularProgress size={18} color='inherit' />
    ) : undefined;

  const strong = (chunks: React.ReactNode): React.ReactElement => (
    <strong>{chunks}</strong>
  );

  return (
    <ContentBox
      title=''
      sx={{
        display: 'flex',
        justifyContent: 'center',
        backgroundColor: theme.vars.palette.background.paper,
        maxWidth: theme.breakpoints.values.sm,
        mx: 'auto',
        mt: 6,
      }}
    >
      <Stack
        spacing={3}
        alignItems='center'
        textAlign='center'
        data-testid='unsubscribe-page'
      >
        {view.status === 'loading' ? (
          <CircularProgress aria-label={t('loadingTitle')} />
        ) : view.status === 'success' ? (
          <CheckCircleOutlineIcon color='success' sx={{ fontSize: 56 }} />
        ) : view.status === 'error' ? (
          <ErrorOutlineIcon color='error' sx={{ fontSize: 56 }} />
        ) : (
          <NotificationsOffOutlinedIcon color='primary' sx={{ fontSize: 56 }} />
        )}

        <Stack spacing={1.5}>
          <Typography variant='h4' component='h1' sx={{ fontWeight: 700 }}>
            {t(view.titleKey)}
          </Typography>
          <Typography variant='body1' color='text.secondary'>
            {t.rich(view.descriptionKey, { type: notificationType, strong })}
          </Typography>
        </Stack>

        {result?.outcome === 'error' ? (
          <Alert
            severity='error'
            variant='outlined'
            sx={{ width: '100%' }}
            data-testid='unsubscribe-error'
          >
            {t('unsubscribeFailed')}
          </Alert>
        ) : null}

        {view.status === 'loading' ? null : (
          <Stack spacing={1.5} sx={{ width: '100%', maxWidth: 360 }}>
            {actionable?.active === true ? (
              <Button
                variant='contained'
                disabled={isPending}
                onClick={() => {
                  handleUnsubscribe('one');
                }}
                startIcon={spinnerFor('one')}
                data-testid='unsubscribe-one'
              >
                {t('unsubscribeOne', { type: notificationType })}
              </Button>
            ) : null}
            {actionable !== null ? (
              <Button
                variant={actionable.active ? 'outlined' : 'contained'}
                disabled={isPending}
                onClick={() => {
                  handleUnsubscribe('all');
                }}
                startIcon={spinnerFor('all')}
                data-testid='unsubscribe-all'
              >
                {t('unsubscribeAll')}
              </Button>
            ) : null}
            {lookup.status === 'error' ? (
              <Button
                variant='contained'
                onClick={() => {
                  if (isAuthReady) {
                    void mutate();
                  } else {
                    dispatch(anonymousLogin());
                  }
                }}
                data-testid='unsubscribe-retry'
              >
                {t('tryAgain')}
              </Button>
            ) : null}
            <Button
              component={Link}
              href={manageHref}
              variant='text'
              disabled={isPending}
              data-testid='manage-notifications'
            >
              {t('manageNotifications')}
            </Button>
          </Stack>
        )}

        {actionable !== null ? (
          <Typography variant='body2' color='text.secondary'>
            {t('manageHint')}
          </Typography>
        ) : null}
      </Stack>
    </ContentBox>
  );
}
