'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AlertTitle,
  Box,
  Button,
  Skeleton,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import React, { useEffect, useRef, useState } from 'react';
import type { HighlightSeverity } from '../../lib/highlights';
import { HIGHLIGHT_PARAM, highlightAnchor } from '../../lib/highlight-links';

/** Highlights shown before "Show all". */
const TOP_HIGHLIGHTS = 3;

const SEVERITY_COLORS: Record<HighlightSeverity, string> = {
  error: '#d32f2f',
  warning: '#ed6c02',
};

interface HighlightLike {
  id: string;
  severity: HighlightSeverity;
  title: string;
}

interface NotableHighlightsProps<H extends HighlightLike> {
  /** Most concerning first; null while loading. */
  highlights: H[] | null;
  error?: string;
  /** Expanded content of a highlight; null makes the row non-expandable. */
  renderDetails: (highlight: H) => React.ReactNode | null;
  /** Shown when no rule fires. */
  emptyText: string;
  /** Own "Notable highlights" heading; off when the card is titled so. */
  heading?: boolean;
}

/**
 * The most concerning changes of an entity page, as collapsible rows: the
 * top few, then "Show all". Details mount only when a row is opened.
 */
export default function NotableHighlights<H extends HighlightLike>({
  highlights,
  error,
  renderDetails,
  emptyText,
  heading = true,
}: NotableHighlightsProps<H>): React.ReactElement {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // ?highlight=<rule id> (from the summary or highlights page): once the
  // highlights are in, open that one and bring it into view.
  const targeted = useRef(false);
  useEffect(() => {
    if (targeted.current || highlights == null) return;
    targeted.current = true;
    const id = new URLSearchParams(window.location.search).get(HIGHLIGHT_PARAM);
    const i = id == null ? -1 : highlights.findIndex((h) => h.id === id);
    if (id == null || i < 0) return;
    if (i >= TOP_HIGHLIGHTS) setShowAll(true);
    setExpanded(new Set([id]));
    // After the rows (and "Show all") have rendered.
    setTimeout(
      () =>
        document
          .getElementById(highlightAnchor(id))
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      100,
    );
  }, [highlights]);
  const toggle = (id: string, open: boolean): void =>
    setExpanded((s) => {
      const next = new Set(s);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const shown =
    highlights == null
      ? []
      : showAll
        ? highlights
        : highlights.slice(0, TOP_HIGHLIGHTS);
  const hidden = (highlights?.length ?? 0) - TOP_HIGHLIGHTS;

  return (
    <Box>
      {heading ? (
        <Typography variant='subtitle2' fontWeight={700} sx={{ mb: 1 }}>
          Notable highlights
        </Typography>
      ) : null}
      {highlights == null ? (
        error ? (
          <Typography variant='caption' color='text.secondary'>
            Could not compute the highlights: {error}
          </Typography>
        ) : (
          [0, 1, 2].map((i) => <Skeleton key={i} height={56} />)
        )
      ) : highlights.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          {emptyText}
        </Typography>
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {shown.map((h) => {
              const details = renderDetails(h);
              return (
                <Accordion
                  key={h.id}
                  id={highlightAnchor(h.id)}
                  disableGutters
                  variant='outlined'
                  expanded={details != null && expanded.has(h.id)}
                  onChange={(_, open) => toggle(h.id, open)}
                  slotProps={{ transition: { unmountOnExit: true } }}
                  sx={{
                    borderColor: SEVERITY_COLORS[h.severity],
                    borderRadius: '4px',
                    scrollMarginTop: 96,
                    '&:before': { display: 'none' },
                  }}
                >
                  <AccordionSummary
                    expandIcon={details ? <ExpandMore /> : null}
                    sx={{
                      px: 0,
                      cursor: details ? 'pointer' : 'default',
                      '& .MuiAccordionSummary-content': { m: 0 },
                    }}
                  >
                    <Alert
                      severity={h.severity}
                      sx={{
                        bgcolor: 'transparent',
                        py: 1,
                        width: '100%',
                        // Icon and one-line title on the same centre line.
                        alignItems: 'center',
                        '& .MuiAlert-icon': { py: 0, mr: 1.5 },
                        '& .MuiAlert-message': { py: 0 },
                      }}
                    >
                      <AlertTitle
                        sx={{
                          m: 0,
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          lineHeight: 1.5,
                        }}
                      >
                        {h.title}
                      </AlertTitle>
                    </Alert>
                  </AccordionSummary>
                  {details ? (
                    <AccordionDetails sx={{ pt: 0 }}>
                      {details}
                    </AccordionDetails>
                  ) : null}
                </Accordion>
              );
            })}
          </Box>
          {hidden > 0 ? (
            <Button
              size='small'
              sx={{ mt: 1 }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? 'Show fewer'
                : `Show all ${highlights.length.toLocaleString()} notable highlights`}
            </Button>
          ) : null}
        </>
      )}
    </Box>
  );
}
