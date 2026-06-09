import { type ReactElement } from 'react';
import CompleteRegistration from './CompleteRegistration';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';

export default function CompleteRegistrationPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      {/* TODO: Revisit protected page wrappers. This page changes the status of the user which causes flickers of mismatched authentication */}
      {/* <ProtectedPageWrapper targetStatus='authenticated'> */}
      <CompleteRegistration />
      {/* </ProtectedPageWrapper> */}
    </ReduxGateWrapper>
  );
}
