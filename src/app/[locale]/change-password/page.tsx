import { type ReactElement } from 'react';
import ChangePassword from './ChangePassword';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';
import { ProtectedPageWrapper } from '../../components/ProtectedPageWrapper';

export default function ChangePasswordPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      <ProtectedPageWrapper>
        <ChangePassword />
      </ProtectedPageWrapper>
    </ReduxGateWrapper>
  );
}
