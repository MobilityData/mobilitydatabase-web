'use client';

import * as React from 'react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { VisibilityOffOutlined, VisibilityOutlined } from '@mui/icons-material';
import {
  Alert,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { useFormik } from 'formik';
import { useTranslations } from 'next-intl';
import * as Yup from 'yup';
import { app } from '../../../firebase';
import { ContentBox } from '../../components/ContentBox';
import { Link } from '../../../i18n/navigation';
import { passwordValidationRegex } from '../../constants/Validation';
import {
  isLinkUnusable,
  mapResetPasswordError,
  type ResetPasswordErrorKey,
} from './lib/reset-password-errors';

/**
 * `verifying` covers the round trip that exchanges the one-time code for the
 * account's email; `linkError` is terminal and can only be escaped by
 * requesting a fresh reset email.
 */
type Stage = 'verifying' | 'form' | 'success' | 'linkError';

interface ResetPasswordProps {
  oobCode?: string;
}

export default function ResetPassword({
  oobCode,
}: ResetPasswordProps): React.ReactElement {
  const t = useTranslations('resetPassword');
  const theme = useTheme();

  const [stage, setStage] = React.useState<Stage>('verifying');
  const [email, setEmail] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<ResetPasswordErrorKey | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  // Error state holds translation keys rather than rendered strings so `t`
  // never has to be a dependency of the effect below.
  React.useEffect(() => {
    let cancelled = false;

    const verifyCode = async (): Promise<void> => {
      if (oobCode === undefined || oobCode.trim() === '') {
        setErrorKey('invalidCode');
        setStage('linkError');
        return;
      }

      try {
        const verifiedEmail = await app.auth().verifyPasswordResetCode(oobCode);
        if (cancelled) return;
        setEmail(verifiedEmail);
        setStage('form');
      } catch (error) {
        if (cancelled) return;
        setErrorKey(mapResetPasswordError(error));
        setStage('linkError');
      }
    };

    void verifyCode();

    return () => {
      cancelled = true;
    };
  }, [oobCode]);

  const ResetPasswordSchema = Yup.object().shape({
    newPassword: Yup.string()
      .required(t('validation.newPasswordRequired'))
      .matches(passwordValidationRegex, t('validation.complexity')),
    confirmPassword: Yup.string()
      .required(t('validation.confirmPasswordRequired'))
      .oneOf([Yup.ref('newPassword')], t('validation.mismatch')),
  });

  const confirmReset = async (newPassword: string): Promise<void> => {
    if (oobCode === undefined) return;

    setIsSubmitting(true);
    setErrorKey(null);

    try {
      await app.auth().confirmPasswordReset(oobCode, newPassword);
      setStage('success');
    } catch (error) {
      const key = mapResetPasswordError(error);
      setErrorKey(key);
      // A spent or rejected code can't be retried from the form.
      if (isLinkUnusable(key)) {
        setStage('linkError');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formik = useFormik({
    initialValues: { newPassword: '', confirmPassword: '' },
    validationSchema: ResetPasswordSchema,
    validateOnChange: isSubmitted,
    validateOnBlur: true,
    onSubmit: (values) => {
      void confirmReset(values.newPassword);
    },
  });

  const passwordVisibilityAdornment = (
    isVisible: boolean,
    toggle: () => void,
  ): React.ReactElement => (
    <InputAdornment position='end'>
      <Tooltip title={t('togglePasswordVisibility')}>
        <IconButton
          color='primary'
          aria-label={t('togglePasswordVisibility')}
          onClick={toggle}
        >
          {isVisible ? (
            <VisibilityOutlined fontSize='small' />
          ) : (
            <VisibilityOffOutlined fontSize='small' />
          )}
        </IconButton>
      </Tooltip>
    </InputAdornment>
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
      {stage === 'verifying' && (
        <Stack spacing={3} alignItems='center' textAlign='center'>
          <CircularProgress aria-label={t('verifyingTitle')} />
          <Stack spacing={1.5}>
            <Typography variant='h4' component='h1' sx={{ fontWeight: 700 }}>
              {t('verifyingTitle')}
            </Typography>
            <Typography variant='body1' color='text.secondary'>
              {t('verifyingDescription')}
            </Typography>
          </Stack>
        </Stack>
      )}

      {stage === 'linkError' && (
        <Stack spacing={3} alignItems='center' textAlign='center'>
          <ErrorOutlineIcon color='error' sx={{ fontSize: 56 }} />
          <Stack spacing={1.5}>
            <Typography variant='h4' component='h1' sx={{ fontWeight: 700 }}>
              {t('errorTitle')}
            </Typography>
            <Typography variant='body1' color='text.secondary'>
              {t(`errors.${errorKey ?? 'generic'}`)}
            </Typography>
          </Stack>
          <Button
            component={Link}
            href='/forgot-password'
            variant='contained'
            data-testid='requestNewLink'
          >
            {t('requestNewLink')}
          </Button>
        </Stack>
      )}

      {stage === 'success' && (
        <Stack spacing={3} alignItems='center' textAlign='center'>
          <CheckCircleOutlineIcon color='success' sx={{ fontSize: 56 }} />
          <Stack spacing={1.5}>
            <Typography variant='h4' component='h1' sx={{ fontWeight: 700 }}>
              {t('successTitle')}
            </Typography>
            <Typography variant='body1' color='text.secondary'>
              {t('successDescription')}
            </Typography>
          </Stack>
          <Button
            component={Link}
            href='/sign-in'
            variant='contained'
            data-testid='goToSignIn'
          >
            {t('goToSignIn')}
          </Button>
        </Stack>
      )}

      {stage === 'form' && (
        <Stack spacing={2}>
          <Stack spacing={1}>
            <Typography variant='h4' component='h1' sx={{ fontWeight: 700 }}>
              {t('title')}
            </Typography>
            <Typography variant='body1' color='text.secondary'>
              {email != null
                ? t('descriptionForEmail', { email })
                : t('description')}
            </Typography>
          </Stack>

          <form onSubmit={formik.handleSubmit} noValidate>
            {/* Lets password managers associate the new credential. */}
            <input
              type='email'
              name='email'
              value={email ?? ''}
              autoComplete='username'
              readOnly
              hidden
            />
            <TextField
              variant='outlined'
              margin='normal'
              required
              fullWidth
              id='newPassword'
              name='newPassword'
              label={t('newPasswordLabel')}
              type={showNewPassword ? 'text' : 'password'}
              autoComplete='new-password'
              autoFocus
              value={formik.values.newPassword}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.errors.newPassword != null}
              data-testid='newPassword'
              slotProps={{
                input: {
                  endAdornment: passwordVisibilityAdornment(
                    showNewPassword,
                    () => {
                      setShowNewPassword(!showNewPassword);
                    },
                  ),
                },
              }}
            />
            {formik.errors.newPassword != null && (
              <Alert severity='error' data-testid='newPasswordError'>
                {formik.errors.newPassword}
              </Alert>
            )}

            <TextField
              variant='outlined'
              margin='normal'
              required
              fullWidth
              id='confirmPassword'
              name='confirmPassword'
              label={t('confirmPasswordLabel')}
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete='new-password'
              value={formik.values.confirmPassword}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.errors.confirmPassword != null}
              data-testid='confirmPassword'
              slotProps={{
                input: {
                  endAdornment: passwordVisibilityAdornment(
                    showConfirmPassword,
                    () => {
                      setShowConfirmPassword(!showConfirmPassword);
                    },
                  ),
                },
              }}
            />
            {formik.errors.confirmPassword != null && (
              <Alert severity='error' data-testid='confirmPasswordError'>
                {formik.errors.confirmPassword}
              </Alert>
            )}

            <Button
              type='submit'
              variant='contained'
              fullWidth
              disabled={isSubmitting}
              sx={{ mt: 3 }}
              onClick={() => {
                setIsSubmitted(true);
              }}
              data-testid='submitResetPassword'
              data-cy='submitResetPasswordButton'
            >
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>

            {errorKey != null && (
              <Alert
                severity='error'
                sx={{ mt: 2 }}
                data-testid='firebaseError'
              >
                {t(`errors.${errorKey}`)}
              </Alert>
            )}
          </form>
        </Stack>
      )}
    </ContentBox>
  );
}
