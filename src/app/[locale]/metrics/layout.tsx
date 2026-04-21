import { type ReactElement } from 'react';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';

export default function MetricsLayout({
  children,
}: {
  children: React.ReactNode;
}): ReactElement {
  return <ReduxGateWrapper>{children}</ReduxGateWrapper>;
}
