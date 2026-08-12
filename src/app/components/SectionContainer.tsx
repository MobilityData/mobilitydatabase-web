import { Container, type ContainerProps } from '@mui/material';
import { type ReactElement } from 'react';

const defaultSectionContainerSx = {
  backgroundColor: 'background.paper',
  borderRadius: '6px',
  paddingTop: 3,
  paddingBottom: 3,
  position: 'relative',
} as const;

export default function SectionContainer({
  sx,
  ...props
}: ContainerProps): ReactElement {
  return (
    <Container
      sx={[defaultSectionContainerSx, ...(Array.isArray(sx) ? sx : [sx])]}
      {...props}
    />
  );
}
