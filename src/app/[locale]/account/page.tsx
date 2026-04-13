import { type ReactElement } from 'react';
import Account from './Account';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';
import { ProtectedPageWrapper } from '../../components/ProtectedPageWrapper';

export default function AccountPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      <ProtectedPageWrapper>
        <Account />
      </ProtectedPageWrapper>
    </ReduxGateWrapper>
  );
}
