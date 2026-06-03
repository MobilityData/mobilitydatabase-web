'use client';

import * as React from 'react';
import { useRouter } from '../../../i18n/navigation';
import { Box, Button, Chip, Link, TextField, Typography } from '@mui/material';
import { Check } from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectSignedInWithProvider,
  selectUserProfile,
} from '../../store/selectors';
import { useTranslations } from 'next-intl';
import { AccountSectionContainer } from './AccountSectionContainer';
import { updateUserInformation } from '../../services';
import {
  refreshUserInformation,
  refreshUserInformationFail,
} from '../../store/profile-reducer';
import { getAppError } from '../../utils/error';
import { type ProfileError } from '../../types';

export default function AccountGeneral(): React.ReactElement {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const user = useSelector(selectUserProfile);
  const dispatch = useDispatch();
  const router = useRouter();
  const signedInWithProvider = useSelector(selectSignedInWithProvider);

  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [draftFullName, setDraftFullName] = React.useState('');
  const [draftOrganization, setDraftOrganization] = React.useState('');

  const handleEditClick = (): void => {
    setDraftFullName(user?.fullName ?? '');
    setDraftOrganization(user?.organization ?? '');
    setIsEditing(true);
  };

  const handleCancel = (): void => {
    setIsEditing(false);
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await updateUserInformation({
        fullName: draftFullName,
        organization: draftOrganization,
        isRegisteredToReceiveAPIAnnouncements:
          user?.isRegisteredToReceiveAPIAnnouncements ?? false,
      });
      dispatch(
        refreshUserInformation({
          fullName: draftFullName,
          organization: draftOrganization,
          isRegisteredToReceiveAPIAnnouncements:
            user?.isRegisteredToReceiveAPIAnnouncements ?? false,
        }),
      );
      setIsEditing(false);
    } catch (error) {
      dispatch(
        refreshUserInformationFail(getAppError(error) as ProfileError),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <AccountSectionContainer
        title={'Personal Information'}
        subtitle={'Your account details and contact information'}
        action={
          isEditing ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant='outlined'
                size='small'
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant='contained'
                size='small'
                onClick={() => {
                  void handleSave();
                }}
                disabled={isSaving}
              >
                Save
              </Button>
            </Box>
          ) : (
            <Button variant='outlined' size='small' onClick={handleEditClick}>
              Edit
            </Button>
          )
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            fullWidth
            label={tCommon('name')}
            value={isEditing ? draftFullName : (user?.fullName ?? '')}
            onChange={
              isEditing
                ? (e) => {
                    setDraftFullName(e.target.value);
                  }
                : undefined
            }
            disabled={!isEditing}
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
          {(isEditing || user?.organization !== undefined) ? (
            <TextField
              fullWidth
              label={tCommon('organization')}
              value={isEditing ? draftOrganization : (user?.organization ?? '')}
              onChange={
                isEditing
                  ? (e) => {
                      setDraftOrganization(e.target.value);
                    }
                  : undefined
              }
              disabled={!isEditing}
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
