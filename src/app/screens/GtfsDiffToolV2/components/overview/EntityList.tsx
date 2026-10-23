'use client';

import { Box, ButtonBase, Typography } from '@mui/material';
import React from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { EntityRow } from '../../lib/highlights';
import { MONO_FONT } from '../calendar/shared';

/** Max height of a highlight's list, px. */
export const ENTITY_LIST_H = 500;
const ROW_H = 44;

interface RowProps {
  rows: EntityRow[];
  onOpen?: (id: string) => void;
}

function Row({
  index,
  style,
  rows,
  onOpen,
}: RowComponentProps<RowProps>): React.ReactElement {
  const r = rows[index];
  const content = (
    <>
      <Typography
        component='span'
        sx={{
          fontFamily: MONO_FONT,
          fontWeight: 700,
          fontSize: '0.8rem',
          color: onOpen ? 'primary.main' : 'text.primary',
          flexShrink: 0,
        }}
      >
        {r.id}
      </Typography>
      <Typography
        component='span'
        variant='body2'
        noWrap
        sx={{ flex: 1, minWidth: 0, color: 'text.secondary' }}
      >
        {r.label}
      </Typography>
      <Typography
        component='span'
        variant='body2'
        noWrap
        sx={{ flexShrink: 0, maxWidth: '45%', fontWeight: 600 }}
      >
        {r.note}
      </Typography>
    </>
  );
  const rowSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    px: 1.5,
    width: '100%',
    height: ROW_H,
    borderBottom: '1px solid',
    borderColor: 'divider',
    textAlign: 'left' as const,
  };
  return (
    <div style={style}>
      {onOpen ? (
        <ButtonBase
          onClick={() => onOpen(r.openId ?? r.id)}
          aria-label={`Open ${r.id}`}
          sx={{ ...rowSx, '&:hover': { bgcolor: 'action.hover' } }}
        >
          {content}
        </ButtonBase>
      ) : (
        <Box sx={rowSx}>{content}</Box>
      )}
    </div>
  );
}

/**
 * The entities behind a highlight. Windowed (react-window), so thousands of
 * stops stay cheap; at most ENTITY_LIST_H tall, then it scrolls.
 */
export default function EntityList({
  rows,
  onOpen,
  caption,
}: {
  rows: EntityRow[];
  /** Selects the entity on the page's map. */
  onOpen?: (id: string) => void;
  caption?: string;
}): React.ReactElement {
  return (
    <Box>
      {caption ? (
        <Typography
          variant='caption'
          color='text.secondary'
          component='div'
          sx={{ mb: 1 }}
        >
          {caption}
        </Typography>
      ) : null}
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '4px',
        }}
      >
        <List
          rowCount={rows.length}
          rowHeight={ROW_H}
          rowComponent={Row}
          rowProps={{ rows, onOpen }}
          style={{ maxHeight: ENTITY_LIST_H }}
        />
      </Box>
    </Box>
  );
}
