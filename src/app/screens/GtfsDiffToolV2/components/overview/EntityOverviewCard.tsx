'use client';

import React from 'react';
import type { EntityRow, Highlight } from '../../lib/highlights';
import { V2Card } from '../trips-v2/shared';
import EntityList from './EntityList';
import NotableHighlights from './NotableHighlights';

interface EntityOverviewCardProps {
  /** Most concerning first; null while loading. */
  highlights: Array<Highlight<EntityRow[]>> | null;
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
 * The overview at the top of an entity page: the notable highlights, each
 * expanding to the entities behind it.
 */
export default function EntityOverviewCard({
  highlights,
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
            <EntityList
              rows={h.entities}
              onOpen={onOpen?.(h)}
              caption={`${h.entities.length.toLocaleString()} ${noun(h)}${onOpen?.(h) ? ` · ${openHint(h)}` : ''}`}
            />
          ) : null
        }
      />
    </V2Card>
  );
}
