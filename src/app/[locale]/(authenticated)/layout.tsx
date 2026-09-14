import * as React from 'react';
import { ReduxGateWrapper } from '../../components/ReduxGateWrapper';
import { ProtectedPageWrapper } from '../../components/ProtectedPageWrapper';

/**
 * Route group layout providing auth guarding and Redux hydration
 * for all authenticated pages (e.g. account, change-password).
 */
export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <ReduxGateWrapper>
      <ProtectedPageWrapper>{children}</ProtectedPageWrapper>
    </ReduxGateWrapper>
  );
}
