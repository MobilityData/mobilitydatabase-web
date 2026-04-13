import { type ReactElement } from 'react';
import SignIn from './SignIn';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';

export default function SignInPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      <SignIn />
    </ReduxGateWrapper>
  );
}
