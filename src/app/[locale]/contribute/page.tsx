import { type ReactElement } from 'react';
import FeedSubmission from './FeedSubmission/FeedSubmission';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';

export default function ContributePage(): ReactElement {
  return (
    <ReduxGateWrapper>
      <FeedSubmission />
    </ReduxGateWrapper>
  );
}
