'use client';

import { Box, Container } from '@mui/material';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import SectionContainer from '../../../../components/SectionContainer';
import ReportHeader, { type ReportHeaderProps } from './ReportHeader';

const SubtitleContext = createContext<
  ((subtitle: string | null) => void) | null
>(null);

/**
 * Set the line under the page title from inside the page content (e.g. the
 * stops page's "8,925 → 8,830 stops · showing 1,054 changed", which depends
 * on its filters). Cleared when the component unmounts.
 */
export function useReportSubtitle(subtitle: string | null): void {
  const setSubtitle = useContext(SubtitleContext);
  useEffect(() => {
    setSubtitle?.(subtitle);
    return () => setSubtitle?.(null);
  }, [setSubtitle, subtitle]);
}

const ActionsSlotContext = createContext<HTMLElement | null>(null);

/**
 * Buttons for the row under the report header, like the feed detail page's
 * CTA buttons under its chips. Rendered from inside the page content through
 * a portal, so the page keeps owning their state and handlers.
 */
export function ReportActions({
  children,
}: React.PropsWithChildren): React.ReactElement | null {
  const slot = useContext(ActionsSlotContext);
  return slot ? createPortal(children, slot) : null;
}

/**
 * Page frame of a diff report, the same as the feed detail page: an xl
 * container on the paper surface, with the report header on top.
 *
 * Panels draw their cards on `background.paper`, which is the container's own
 * colour here; inside the content the token is pointed at
 * `background.default` so cards stand out the way the feed page's do.
 */
export default function ReportLayout({
  children,
  ...header
}: React.PropsWithChildren<
  Omit<ReportHeaderProps, 'subtitle'>
>): React.ReactElement {
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  return (
    <Container
      component='main'
      maxWidth='xl'
      sx={{ width: '100%', m: 'auto', px: 0 }}
    >
      <SectionContainer maxWidth='xl' sx={{ mb: 4 }}>
        <ReportHeader {...header} subtitle={subtitle} />
        <Box
          ref={setActionsSlot}
          sx={{
            display: 'flex',
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
            gap: 1,
            pt: 3,
            '&:empty': { display: 'none' },
          }}
        />
        <Box
          sx={{
            mt: 3,
            '--mui-palette-background-paper':
              'var(--mui-palette-background-default)',
          }}
        >
          <SubtitleContext.Provider value={setSubtitle}>
            <ActionsSlotContext.Provider value={actionsSlot}>
              {children}
            </ActionsSlotContext.Provider>
          </SubtitleContext.Provider>
        </Box>
      </SectionContainer>
    </Container>
  );
}
