'use client';

import { Box, Button, Typography } from '@mui/material';
import React, { useMemo, useState } from 'react';
import type { TripPair } from '../../lib/trips-types';
import { technicalSummary } from '../../lib/trips-v2-summary';
import { MONO_FONT } from '../trips/shared';
import { V2Card } from './shared';

const PREVIEW = 8;

interface TechnicalDrilldownCardProps {
  /** Pairs in scope: the selected route's, else the whole day's. */
  pairs: TripPair[];
  /** The day compared, for the scope tag: "Weekday · Tue 8 Sep". */
  scope: string;
  /** What the pairs cover: "Every route", "Route 24". */
  subject: string;
  /** Without the card and its title, for a popup titled already. */
  bare?: boolean;
}

/**
 * What the rider-level views leave out: trips that only changed IDs, the
 * trip_id mapping, and raw stop_times fields.
 */
export default function TechnicalDrilldownCard({
  pairs,
  scope,
  subject,
  bare = false,
}: TechnicalDrilldownCardProps): React.ReactElement {
  const [showMapping, setShowMapping] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const t = useMemo(() => technicalSummary(pairs), [pairs]);
  const shown = showAll ? t.mapping : t.mapping.slice(0, PREVIEW);

  const mappingButton =
    t.mapping.length > 0 ? (
      <Button
        size='small'
        variant='outlined'
        color='inherit'
        onClick={() => setShowMapping((v) => !v)}
        sx={{ textTransform: 'none', borderColor: 'divider' }}
      >
        {showMapping ? 'Hide trip_id mapping' : 'Show trip_id mapping'}
      </Button>
    ) : null;
  const body = (
    <>
      <Typography variant='body2' sx={{ mb: 0.5 }}>
        {t.idOnly === 0
          ? 'No trip matched with only an ID change.'
          : `${t.idOnly} trip${t.idOnly === 1 ? '' : 's'} matched with identical times, stops and attributes. Only trip_id changed, so they count as restructured and stay out of the views above.`}
      </Typography>
      {t.weakMatches > 0 ? (
        <Typography variant='body2' color='text.secondary' sx={{ mb: 0.5 }}>
          {t.weakMatches} trip{t.weakMatches === 1 ? ' was' : 's were'} paired
          only because the trip_id is unchanged: the stops or times differ too
          much to be sure it is the same trip. They are shown as changed trips
          above (marked “id match”), as in the raw file diff, not as removed +
          added.
        </Typography>
      ) : null}
      {t.changedWithNewIds > 0 ? (
        <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
          {t.changedWithNewIds} changed trip
          {t.changedWithNewIds === 1
            ? ' also has a new trip_id'
            : 's also have new trip_id values'}
          . Each match is shown in the trip detail.
        </Typography>
      ) : null}
      {showMapping && t.mapping.length > 0 ? (
        <Box
          sx={{
            fontFamily: MONO_FONT,
            fontSize: '0.75rem',
            bgcolor: 'action.hover',
            borderRadius: '4px',
            p: 1.5,
            mb: 1.5,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {shown.map((m) => (
            <div key={m}>{m}</div>
          ))}
          {t.mapping.length > PREVIEW ? (
            <Box
              component='button'
              type='button'
              onClick={() => setShowAll((v) => !v)}
              sx={{
                mt: 0.5,
                p: 0,
                border: 0,
                bgcolor: 'transparent',
                color: 'primary.main',
                cursor: 'pointer',
                font: 'inherit',
                textDecoration: 'underline',
              }}
            >
              {showAll
                ? 'show fewer'
                : `and ${t.mapping.length - PREVIEW} more`}
            </Box>
          ) : null}
        </Box>
      ) : null}
      <Box
        sx={{
          display: 'flex',
          gap: 3,
          rowGap: 0.5,
          flexWrap: 'wrap',
          fontFamily: MONO_FONT,
          fontSize: '0.72rem',
          color: 'text.secondary',
        }}
      >
        {t.fields.map((f) => (
          <span key={f.field}>
            {f.field}: {f.changes} change{f.changes === 1 ? '' : 's'}
          </span>
        ))}
        <span>
          frequencies.txt:{' '}
          {t.frequencyTrips === 0
            ? 'not used'
            : `${t.frequencyTrips} trip${t.frequencyTrips === 1 ? '' : 's'}`}
        </span>
      </Box>
    </>
  );

  return bare ? (
    <Box sx={{ p: 2.5 }}>
      {mappingButton ? <Box sx={{ mb: 1.5 }}>{mappingButton}</Box> : null}
      {body}
    </Box>
  ) : (
    <V2Card
      title='Technical drill-down'
      scope={scope}
      caption={subject}
      actions={mappingButton}
    >
      {body}
    </V2Card>
  );
}
