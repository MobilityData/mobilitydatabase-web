import { type ReactElement } from 'react';
import CompleteRegistration from './CompleteRegistration';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';
import { ProtectedPageWrapper } from '../../components/ProtectedPageWrapper';

export default function CompleteRegistrationPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      <ProtectedPageWrapper targetStatus='authenticated'>
        <CompleteRegistration />
      </ProtectedPageWrapper>
    </ReduxGateWrapper>
  );
}
