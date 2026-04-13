import { type ReactElement } from 'react';
import PostRegistration from './PostRegistration';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';
import { ProtectedPageWrapper } from '../../components/ProtectedPageWrapper';

export default function VerifyEmailPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      <ProtectedPageWrapper targetStatus='unverified'>
        <PostRegistration />
      </ProtectedPageWrapper>
    </ReduxGateWrapper>
  );
}
