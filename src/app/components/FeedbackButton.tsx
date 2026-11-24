'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import { useTranslations } from 'next-intl';
import { useAppSelector } from '../hooks';
import { selectUserProfile } from '../store/profile-selectors';
import { useAuthSession } from './AuthSessionProvider';
import { buildFeedbackUrl, type FeedbackFormId } from '../utils/feedback-url';

interface FeedbackButtonProps {
  /** Which feature's feedback form the button opens. */
  form: FeedbackFormId;
}

/** Per-form accessible label: the visible label is the same for every form. */
const ARIA_LABEL_KEYS = {
  seal: 'sealFeedbackButtonAriaLabel',
  notifications: 'notificationsFeedbackButtonAriaLabel',
} as const satisfies Record<FeedbackFormId, string>;

/**
 *
 * Floating "Got feedback?" link to a feature's Google Form: a vertical tab on
 * the right edge on large screens, a FAB in the bottom-right corner below.
 *
 * The user's name and email are prefilled into the form when the app knows
 * them. Both sources are read because they settle at different times: the
 * Redux profile is the richer one (it carries `fullName` from registration)
 * but only after redux-persist rehydrates, while the Firebase session
 * resolves on its own schedule. Signed-out and anonymous visitors simply get
 * an unprefilled form - the link is never gated on identity.
 *
 */
export default function FeedbackButton({
  form,
}: FeedbackButtonProps): ReactElement {
  const t = useTranslations('common');
  const user = useAppSelector(selectUserProfile);
  const {
    email: sessionEmail,
    displayName,
    isAuthenticated,
  } = useAuthSession();

  const name = isAuthenticated ? user?.fullName?.trim() || displayName : null;
  const email = isAuthenticated ? user?.email?.trim() || sessionEmail : null;

  /**
   * Who the visitor is exists only on the client, so prefilling during the
   * first render would make it disagree with the server HTML. React 19 does
   * not patch a mismatched attribute - it keeps the server's value and logs a
   * hydration error - which meant the prefilled href never reached the DOM at
   * all. Holding the prefill until after mount turns it into an ordinary
   * update, which does reach the DOM.
   */
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Before mount the link still points at the form, just without the
  // prefill, so it works for anyone who clicks during hydration.
  const feedbackUrl = useMemo(
    () =>
      isMounted
        ? buildFeedbackUrl(form, { name, email })
        : buildFeedbackUrl(form),
    [form, isMounted, name, email],
  );

  return (
    <>
      <Button
        variant='contained'
        disableElevation
        href={feedbackUrl}
        target='_blank'
        rel='noreferrer'
        data-testid={`${form}-feedback-button`}
        aria-label={t(ARIA_LABEL_KEYS[form])}
        sx={{
          display: { xs: 'none', lg: 'inline-flex' },
          position: 'fixed',
          right: '-64px',
          top: 0,
          bottom: 0,
          height: 'fit-content',
          marginTop: 'auto',
          marginBottom: 'auto',
          zIndex: (theme) => theme.zIndex.appBar - 1,
          transform: 'rotate(270deg)',
        }}
        startIcon={<FeedbackOutlinedIcon fontSize='small' aria-hidden />}
      >
        {t('feedbackButtonLabel')}
      </Button>
      <Fab
        color='primary'
        href={feedbackUrl}
        target='_blank'
        rel='noreferrer'
        data-testid={`${form}-feedback-fab`}
        aria-label={t(ARIA_LABEL_KEYS[form])}
        sx={{
          display: { xs: 'flex', lg: 'none' },
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: (theme) => theme.zIndex.appBar - 1,
        }}
      >
        <FeedbackOutlinedIcon />
      </Fab>
    </>
  );
}
