'use client';

import { Box, Button, Typography } from '@mui/material';
import React, { useState } from 'react';
import type { EntityRow, Highlight } from '../../lib/highlights';
import { useHighlightsFile } from '../../lib/useDiffData';
import { V2Card } from '../trips-v2/shared';
import EntityList from './EntityList';
import NotableHighlights from './NotableHighlights';

interface EntityOverviewCardProps {
  datasetId: string;
  /** Most concerning first; null while loading. */
  highlights: Array<Highlight<EntityRow[]>> | null;
  /**
   * The section's highlights with full entity lists (stops-highlights.json),
   * when `highlights` keep only each list's first rows.
   */
  highlightsFile?: string;
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
 * A highlight's entities: the rows stored inline, and the whole list from the
 * section's highlights file on "Show all".
 */
function HighlightEntities({
  datasetId,
  highlight: h,
  highlightsFile,
  noun,
  onOpen,
  openHint,
}: {
  datasetId: string;
  highlight: Highlight<EntityRow[]>;
  highlightsFile?: string;
  noun: string;
  onOpen?: (id: string) => void;
  openHint: string;
}): React.ReactElement {
  const inline = h.entities ?? [];
  const total = h.entities_total ?? inline.length;
  const [showAll, setShowAll] = useState(false);
  const file = useHighlightsFile(
    datasetId,
    showAll ? (highlightsFile ?? null) : null,
  );
  const full = file.data?.highlights.find((x) => x.id === h.id)?.entities;
  const rows = full ?? inline;
  const partial = rows.length < total;
  const caption = `${partial ? `First ${rows.length.toLocaleString()} of ` : ''}${total.toLocaleString()} ${noun}${onOpen ? ` · ${openHint}` : ''}`;
  return (
    <Box>
      <EntityList rows={rows} onOpen={onOpen} caption={caption} />
      {partial && highlightsFile ? (
        file.error ? (
          <Typography
            variant='caption'
            color='error'
            component='div'
            sx={{ mt: 1 }}
          >
            Could not load the full list: {file.error.message}
          </Typography>
        ) : (
          <Button
            size='small'
            sx={{ mt: 1 }}
            disabled={file.isLoading}
            onClick={() => setShowAll(true)}
          >
            {file.isLoading
              ? `Loading ${total.toLocaleString()} ${noun}…`
              : `Show all ${total.toLocaleString()} ${noun}`}
          </Button>
        )
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
  highlights,
  highlightsFile,
  noun,
  onOpen,
  openHint = () => 'select one to show it on the map',
  emptyText,
}: EntityOverviewCardProps): React.ReactElement {
  return (
    <V2Card title='Notable highlights'>
      <NotableHighlights
        heading={false}
        highlights={highlights}
        emptyText={emptyText}
        renderDetails={(h) =>
          h.entities && h.entities.length > 0 ? (
            <HighlightEntities
              datasetId={datasetId}
              highlight={h}
              highlightsFile={highlightsFile}
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
