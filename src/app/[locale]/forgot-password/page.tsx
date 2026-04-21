import { type ReactElement } from 'react';
import ForgotPassword from '../../screens/ForgotPassword';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';

export default function ForgotPasswordPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      <ForgotPassword />
    </ReduxGateWrapper>
  );
}
