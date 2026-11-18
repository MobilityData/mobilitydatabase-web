'use client';

import { Box, Button, Typography } from '@mui/material';
import React, { useState } from 'react';
import {
  type EntityRow,
  type Highlight,
  INLINE_ENTITY_ROWS,
} from '../../lib/highlights';
import { useHighlightsFile } from '../../lib/useDiffData';
import { V2Card } from '../trips-v2/shared';
import EntityList from './EntityList';
import NotableHighlights from './NotableHighlights';

interface EntityOverviewCardProps {
  datasetId: string;
  /**
   * The section's highlights with their entity lists
   * (highlights/stops.json), loaded for the cards.
   */
  highlightsFile?: string;
  /**
   * Older builds only: the highlights inline (first rows of each list),
   * shown when there is no `highlightsFile`.
   */
  highlights?: Array<Highlight<EntityRow[]>> | null;
  /** Noun for the list caption: "stops", "routes". */
  noun: (highlight: Highlight<EntityRow[]>) => string;
  /** Select an entity on the page's map; per highlight (some list other entities). */
  onOpen?: (
    highlight: Highlight<EntityRow[]>,
  ) => ((id: string) => void) | undefined;
  /** What selecting a row does, for the caption (default: shows it on the map). */
  openHint?: (highlight: Highlight<EntityRow[]>) => string;
  emptyText: string;
}

/**
 * A highlight's entities: the first INLINE_ENTITY_ROWS rows, all of them on
 * "Show all".
 */
function HighlightEntities({
  highlight: h,
  noun,
  onOpen,
  openHint,
}: {
  highlight: Highlight<EntityRow[]>;
  noun: string;
  onOpen?: (id: string) => void;
  openHint: string;
}): React.ReactElement {
  const all = h.entities ?? [];
  // Older builds' inline lists stop at INLINE_ENTITY_ROWS: entities_total.
  const total = h.entities_total ?? all.length;
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? all : all.slice(0, INLINE_ENTITY_ROWS);
  const caption = `${rows.length < total ? `First ${rows.length.toLocaleString()} of ` : ''}${total.toLocaleString()} ${noun}${onOpen ? ` · ${openHint}` : ''}`;
  return (
    <Box>
      <EntityList rows={rows} onOpen={onOpen} caption={caption} />
      {rows.length < all.length ? (
        <Button size='small' sx={{ mt: 1 }} onClick={() => setShowAll(true)}>
          Show all {total.toLocaleString()} {noun}
        </Button>
      ) : null}
    </Box>
  );
}

/**
 * The overview at the top of an entity page: the notable highlights, each
 * expanding to the entities behind it.
 */
export default function EntityOverviewCard({
  datasetId,
  highlights: inline,
  highlightsFile,
  noun,
  onOpen,
  openHint = () => 'select one to show it on the map',
  emptyText,
}: EntityOverviewCardProps): React.ReactElement {
  const file = useHighlightsFile(datasetId, highlightsFile);
  // null while the file loads.
  const highlights = highlightsFile
    ? (file.data?.highlights ?? null)
    : (inline ?? []);
  return (
    <V2Card title='Notable highlights'>
      {file.error ? (
        <Typography variant='body2' color='error'>
          Could not load the highlights: {file.error.message}
        </Typography>
      ) : null}
      <NotableHighlights
        heading={false}
        highlights={file.error ? [] : highlights}
        emptyText={file.error ? '' : emptyText}
        renderDetails={(h) =>
          h.entities && h.entities.length > 0 ? (
            <HighlightEntities
              highlight={h}
              noun={noun(h)}
              onOpen={onOpen?.(h)}
              openHint={openHint(h)}
            />
          ) : null
        }
      />
    </V2Card>
  );
}
