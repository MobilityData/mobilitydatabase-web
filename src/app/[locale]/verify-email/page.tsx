import { type ReactElement } from 'react';
import PostRegistration from './PostRegistration';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';
import { ProtectedPageWrapper } from '../../components/ProtectedPageWrapper';

export default function VerifyEmailPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      {/* TODO: Revisit protected page wrappers. This page changes the status of the user which causes flickers of mismatched authentication */}
      {/* <ProtectedPageWrapper targetStatus='unverified'> */}
        <PostRegistration />
      {/* </ProtectedPageWrapper> */}
    </ReduxGateWrapper>
  );
}
