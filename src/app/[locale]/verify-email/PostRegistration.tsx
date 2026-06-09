'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { EmailOutlined, InfoOutlined, Sync } from '@mui/icons-material';
import { Alert, Button } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { emailVerified, verifyEmail } from '../../store/profile-reducer';
import {
  selectEmailVerificationError,
  selectIsVerificationEmailSent,
} from '../../store/profile-selectors';
import { type ProfileError } from '../../types';
import { app } from '../../../firebase';
import { useEffect } from 'react';
import { useRegistrationFlowRedirect } from '../../hooks';
export default function PostRegistration(): React.ReactElement {
  const dispatch = useDispatch();
  const selectResendEmailSuccess = useSelector(selectIsVerificationEmailSent);
  const selectResendEmailError = useSelector(selectEmailVerificationError);
  const [resendEmailSuccess, setResendEmailSuccess] = React.useState(false);
  const [resendEmailError, setResendEmailError] =
    React.useState<ProfileError | null>(null);

  useRegistrationFlowRedirect();
  React.useEffect(() => {
    setResendEmailSuccess(selectResendEmailSuccess);
  }, [selectResendEmailSuccess]);
  React.useEffect(() => {
    setResendEmailError(selectResendEmailError ?? null);
  }, [selectResendEmailError]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void app
        .auth()
        .currentUser?.reload()
        .then(() => {
          const currentUser = app.auth().currentUser;

          if (currentUser !== null && currentUser.emailVerified) {
            dispatch(emailVerified());
            clearInterval(intervalId);
          }
        });
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return (
    <Container component='main' maxWidth='sm'>
      <Box
        sx={{
          ml: 2,
          mr: 2,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Typography
          component='h1'
          variant='h5'
          color='primary'
          fontWeight='bold'
          sx={{ display: 'flex', alignItems: 'center' }}
        >
          <EmailOutlined sx={{ mr: 1 }} />
          <div>Check your email !</div>
        </Typography>
        <Typography color='primary'>
          Thank you for registering for an API Account on the Mobility Database.
        </Typography>
        <Box sx={{ mt: 2 }}>
          An email has been sent or will be sent to you shortly confirming your
          account registration. Please also check your junk or spam folder if
          you do not see it in your inbox.
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button
            variant='contained'
            color='primary'
            startIcon={<Sync />}
            onClick={() => {
              dispatch(verifyEmail());
            }}
          >
            Resend Email
          </Button>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          {resendEmailSuccess ? (
            <Alert severity='success'>Email sent successfully</Alert>
          ) : null}
          {resendEmailError !== null ? (
            <Alert severity='error'>{resendEmailError?.message}</Alert>
          ) : null}
        </Box>
        <Box sx={{ mt: 2 }}>
          <InfoOutlined sx={{ verticalAlign: 'middle' }} /> You will be
          automatically redirected to your account page once your email is
          verified.
        </Box>
      </Box>
    </Container>
  );
}
