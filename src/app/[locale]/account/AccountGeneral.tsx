'use client';

import * as React from 'react';
import { useRouter } from '../../../i18n/navigation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Link,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectSignedInWithProvider,
  selectUserProfile,
} from '../../store/selectors';
import { selectSaveUserProfileStatus } from '../../store/profile-selectors';
import { useTranslations } from 'next-intl';
import { AccountSectionContainer } from './AccountSectionContainer';
import {
  saveUserProfile,
  saveUserProfileReset,
} from '../../store/profile-reducer';

export default function AccountGeneral(): React.ReactElement {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const user = useSelector(selectUserProfile);
  const dispatch = useDispatch();
  const router = useRouter();
  const signedInWithProvider = useSelector(selectSignedInWithProvider);
  const saveStatus = useSelector(selectSaveUserProfileStatus);

  const [isEditing, setIsEditing] = React.useState(false);
  const [draftFullName, setDraftFullName] = React.useState('');
  const [draftOrganization, setDraftOrganization] = React.useState('');
  const [
    draftIsRegisteredToReceiveAPIAnnouncements,
    setDraftIsRegisteredToReceiveAPIAnnouncements,
  ] = React.useState(false);
  const [alertSeverity, setAlertSeverity] = React.useState<'success' | 'error'>(
    'success',
  );

  const handleEditClick = (): void => {
    setDraftFullName(user?.fullName ?? '');
    setDraftOrganization(user?.organization ?? '');
    setDraftIsRegisteredToReceiveAPIAnnouncements(
      user?.isRegisteredToReceiveAPIAnnouncements ?? false,
    );
    dispatch(saveUserProfileReset());
    setIsEditing(true);
  };

  const handleCancel = (): void => {
    dispatch(saveUserProfileReset());
    setIsEditing(false);
  };

  const handleSave = (): void => {
    dispatch(
      saveUserProfile({
        fullName: draftFullName,
        organization: draftOrganization,
        isRegisteredToReceiveAPIAnnouncements:
          draftIsRegisteredToReceiveAPIAnnouncements,
      }),
    );
  };

  React.useEffect(() => {
    dispatch(saveUserProfileReset());
  }, [dispatch]);

  React.useEffect(() => {
    if (saveStatus === 'success') {
      setIsEditing(false);
      setAlertSeverity('success');
    } else if (saveStatus === 'fail') {
      setAlertSeverity('error');
    }
  }, [saveStatus]);

  const isSaving = saveStatus === 'loading';

  return (
    <>
      <Snackbar
        open={saveStatus === 'success' || saveStatus === 'fail'}
        autoHideDuration={4000}
        onClose={() => {
          dispatch(saveUserProfileReset());
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity={alertSeverity}
          onClose={() => {
            dispatch(saveUserProfileReset());
          }}
          sx={{ width: '100%' }}
        >
          {alertSeverity === 'success' ? t('saveSuccess') : t('saveError')}
        </Alert>
      </Snackbar>
      <AccountSectionContainer
        title={t('personalInformation')}
        subtitle={t('personalInformationSubtitle')}
        loading={isSaving}
        action={
          isEditing ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant='outlined'
                size='small'
                onClick={handleCancel}
                disabled={isSaving}
              >
                {t('cancel')}
              </Button>
              <Button
                variant='contained'
                size='small'
                onClick={handleSave}
                disabled={isSaving}
              >
                {t('save')}
              </Button>
            </Box>
          ) : (
            <Button variant='outlined' size='small' onClick={handleEditClick}>
              {t('edit')}
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
          <FormControlLabel
            control={
              <Checkbox
                checked={
                  isEditing
                    ? draftIsRegisteredToReceiveAPIAnnouncements
                    : (user?.isRegisteredToReceiveAPIAnnouncements ?? false)
                }
                onChange={
                  isEditing
                    ? (e) => {
                        setDraftIsRegisteredToReceiveAPIAnnouncements(
                          e.target.checked,
                        );
                      }
                    : undefined
                }
                disabled={!isEditing}
              />
            }
            label={t('registerApiAnnouncements')}
            sx={{ mt: 0.5 }}
          />
        </Box>
      </AccountSectionContainer>
      <AccountSectionContainer title={t('supportTitle')} sx={{ mt: 3 }}>
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
              {t('changePassword')}
            </Button>
          )}
        </Box>
      </AccountSectionContainer>
    </>
  );
}
