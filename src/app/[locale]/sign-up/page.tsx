import { type ReactElement } from 'react';
import SignUp from './SignUp';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';

export default function SignUpPage(): ReactElement {
  return (
    <ReduxGateWrapper>
      <SignUp />
    </ReduxGateWrapper>
  );
}
