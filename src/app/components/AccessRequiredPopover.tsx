'use client';

import { Suspense } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '../../i18n/navigation';
import { useAuthSession } from './AuthSessionProvider';

export const EARLY_ACCESS_REQUEST_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfJQA237kboYWRy5BALkXC6tvvFiAZQhZifBaSp3W30iBTk-A/viewform?usp=dialog';

const MEMBERSHIP_URL = 'https://mobilitydata.org/members/';

interface AccessRequiredPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  title: string;
  description: string;
  requestAccessUrl: string;
}

// next/navigation's useSearchParams() opts its subtree out of static
// rendering unless wrapped in Suspense — this component is rendered on the
// statically-generated feed detail page, so the hook (and the Suspense
// boundary it requires) is isolated to this small child rather than the
// whole popover, keeping the opt-out scope to just this button.
function LoginButton({
  pathname,
  onClose,
}: {
  pathname: string;
  onClose: () => void;
}): React.ReactElement {
  const t = useTranslations('common');
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const currentPath = query.length > 0 ? `${pathname}?${query}` : pathname;

  return (
    <Button
      variant='contained'
      disableElevation
      component={Link}
      sx={{ width: '100%', mb: 1 }}
      href={`/sign-in?redirect_to=${encodeURIComponent(currentPath)}`}
      onClick={onClose}
    >
      {t('login')}
    </Button>
  );
}

export default function AccessRequiredPopover({
  anchorEl,
  onClose,
  title,
  description,
  requestAccessUrl,
}: AccessRequiredPopoverProps): React.ReactElement {
  const t = useTranslations('common');
  const pathname = usePathname();
  const { isAuthenticated } = useAuthSession();

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
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
          {title}
        </Typography>
        <Typography
          variant='subtitle1'
          color='text.secondary'
          sx={{ my: 1, lineHeight: 1.5 }}
        >
          {description}
        </Typography>
        {!isAuthenticated && (
          <Suspense fallback={null}>
            <LoginButton pathname={pathname} onClose={onClose} />
          </Suspense>
        )}
        <Button
          variant='outlined'
          disableElevation
          component={Link}
          sx={{ width: '100%' }}
          href={requestAccessUrl}
          target='_blank'
          rel='nofollow'
          onClick={onClose}
        >
          {t('accessRequired.requestAccess')}
        </Button>
        <Button
          variant='text'
          component={Link}
          href={MEMBERSHIP_URL}
          target='_blank'
          rel='nofollow'
        >
          {t('accessRequired.learnAboutMembership')}
        </Button>
      </Box>
    </Popover>
  );
}
