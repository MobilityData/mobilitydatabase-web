'use client';

import * as React from 'react';
import { useRouter } from '../../../i18n/navigation';
import { Box, Button, Chip, Link, TextField, Typography } from '@mui/material';
import { Check } from '@mui/icons-material';
import { useSelector } from 'react-redux';
import {
  selectSignedInWithProvider,
  selectUserProfile,
} from '../../store/selectors';
import { useTranslations } from 'next-intl';
import { AccountSectionContainer } from './AccountSectionContainer';

export default function AccountGeneral(): React.ReactElement {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const user = useSelector(selectUserProfile);
  const router = useRouter();
  const signedInWithProvider = useSelector(selectSignedInWithProvider);

  return (
    <>
      {/* Edit action to be enabled when we have the user profile API */}
      <AccountSectionContainer
        title={'Personal Information'}
        subtitle={'Your account details and contact information'}
        // action={
        //   <Button variant='outlined' size='small'>
        //     Edit
        //   </Button>
        // }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            fullWidth
            label={tCommon('name')}
            value={user?.fullName ?? ''}
            disabled
            sx={{ mt: 1 }}
            size='small'
          />

          {user?.email !== undefined && user?.email !== '' ? (
            <TextField
              fullWidth
              label={tCommon('email')}
              value={user?.email ?? ''}
              disabled
              sx={{ mt: 1 }}
              size='small'
            />
          ) : null}
          {user?.organization !== undefined ? (
            <TextField
              fullWidth
              label={tCommon('organization')}
              value={user?.organization ?? ''}
              disabled
              sx={{ mt: 1 }}
              size='small'
            />
          ) : null}
          {user?.isRegisteredToReceiveAPIAnnouncements === true ? (
            <Chip
              label={t('registerApiAnnouncements')}
              color='primary'
              variant='outlined'
              sx={{ mt: 0.5, width: 'fit-content' }}
              icon={<Check />}
            />
          ) : null}
        </Box>
      </AccountSectionContainer>
      <AccountSectionContainer title={'Account Support'} sx={{ mt: 3 }}>
        <Typography sx={{ pt: 1 }}>
          {t('support') + ' '}
          <Link
            href='mailto:api@mobilitydata.org?subject=Remove Mobility Database account'
            color={'inherit'}
            target={'_blank'}
            fontWeight={'bold'}
          >
            api@mobilitydata.org
          </Link>
          .
        </Typography>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-start',
            gap: 1,
            pt: 1,
          }}
        >
          {!signedInWithProvider && (
            <Button
              data-cy='changePasswordButtonAccount'
              variant='contained'
              color='primary'
              onClick={() => {
                router.push('/change-password');
              }}
              sx={{ mt: 1 }}
            >
              Change Password
            </Button>
          )}
        </Box>
      </AccountSectionContainer>
    </>
  );
}
