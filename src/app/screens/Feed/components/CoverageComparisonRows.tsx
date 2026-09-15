import * as React from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import { getTranslations } from 'next-intl/server';
import TimelineTrack, {
  type TrackSegment,
  type TrackTone,
} from '../../../components/TimelineTrack';
import {
  type TrackPlacement,
  anchorBandToBar,
  placeAnnotationOnAxis,
} from '../../../utils/timeline';
import {
  type CoverageComparison,
  type CoverageJoin,
  type CoverageJoinKind,
  type CoverageRow,
  type CoverageTrackSource,
} from '../lib/continuous-coverage';
import { formatDateShort } from '../../../utils/date';

/** Row labels are file names, so they are not translated. */
const TRACK_LABELS: Record<CoverageTrackSource, string> = {
  feedInfo: 'feed_info.txt',
  calendar: 'calendar files',
};

/** Label column then the track, which takes whatever width is left. */
const trackRowStyle = {
  display: 'grid',
  gridTemplateColumns: {
    xs: '92px minmax(0, 1fr)',
    sm: '124px minmax(0, 1fr)',
  },
  alignItems: 'center',
  gap: 1,
  mb: 0.5,
} as const;

/**
 * Floor on the width a join is drawn at. A handful of days on an axis of
 * years rounds to a fraction of a percent, and neither a gap nor an overlap
 * is worth losing to rounding.
 */
const JOIN_MIN_WIDTH_PX = 6;

/**
 * How each join is drawn over the dataset bars either side of it. Bands carry
 * no writing of their own - a join is often a few days wide, with no room for
 * any - so the chip below the bars is what states them. `meets` has no entry:
 * windows that meet exactly enclose no day, so there is nothing to band, and
 * the two bars already abut on the axis.
 */
const JOIN_BANDS: Partial<
  Record<CoverageJoinKind, { tone: TrackTone; ariaKey: string }>
> = {
  overlap: { tone: 'successSolid', ariaKey: 'sealContinuousTrackOverlapLabel' },
  gap: { tone: 'errorDashed', ariaKey: 'sealContinuousTrackGapLabel' },
};

/** Colour of the join's chip, matching the band drawn on the bars. */
const JOIN_CHIP_COLORS: Record<
  CoverageJoinKind,
  'success' | 'error' | 'default'
> = {
  overlap: 'success',
  gap: 'error',
  meets: 'default',
};

/** The sentence a join's caption is written with. Keys in `feeds`. */
const JOIN_CAPTION_KEYS: Record<
  CoverageJoinKind,
  { detail: string; unshown: string }
> = {
  overlap: {
    detail: 'sealContinuousJoinOverlapDetail',
    unshown: 'sealContinuousJoinOverlapUnshown',
  },
  gap: {
    detail: 'sealContinuousJoinGapDetail',
    unshown: 'sealContinuousJoinGapUnshown',
  },
  meets: {
    detail: 'sealContinuousJoinMeetsDetail',
    unshown: 'sealContinuousJoinMeetsUnshown',
  },
};

/**
 * The joins either side of a dataset: the one it opens with the dataset drawn
 * below it, and the one the dataset above it opens with this one. Both are
 * drawn on this dataset's own bars, since both describe days inside - or just
 * outside - the window that bar covers.
 */
function getRowJoins(
  rows: CoverageRow[],
  index: number,
): Array<{ id: string; join: CoverageJoin }> {
  const candidates = [
    { id: 'join-below', join: rows[index].join },
    { id: 'join-above', join: index > 0 ? rows[index - 1].join : undefined },
  ];
  return candidates.flatMap(({ id, join }) =>
    join?.span != undefined ? [{ id, join }] : [],
  );
}

export interface CoverageComparisonRowsProps {
  comparison: CoverageComparison;
  /**
   * Colours the bars. The datasets themselves are the evidence for the
   * criterion's verdict, so they take its tone.
   */
  tone: TrackTone;
}

/**
 * The datasets of a comparison stacked newest-first on one shared axis, each
 * showing the window its `feed_info.txt` declares above the one its calendar
 * files derive.
 *
 * The join between two datasets is drawn on the bars themselves rather than
 * on a track of its own: the days they share are banded over both bars, and
 * the days neither covers are outlined in the space between them. A chip
 * under the bars names which it is, how long it runs, and over what dates.
 */
export default async function CoverageComparisonRows({
  comparison,
  tone,
}: CoverageComparisonRowsProps): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const tCommon = await getTranslations('common');

  /** The bands a dataset's bars carry for the joins either side of it. */
  const joinSegments = (
    joins: Array<{ id: string; join: CoverageJoin }>,
    bar: TrackPlacement,
  ): TrackSegment[] =>
    joins.flatMap(({ id, join }) => {
      const band = JOIN_BANDS[join.kind];
      if (band == undefined || join.span == undefined) {
        return [];
      }
      return [
        {
          id,
          ...join.span.placement,
          minWidthPx: JOIN_MIN_WIDTH_PX,
          // A join at the far end of this bar - the last day an older dataset
          // covers - grows inwards, so the floor above does not leave it
          // hanging off the end of the bar it belongs to.
          anchor: anchorBandToBar(join.span.placement, bar),
          tone: band.tone,
        },
      ];
    });

  /** What the bands add to a track's description, which cannot show them. */
  const joinDescriptions = (
    joins: Array<{ id: string; join: CoverageJoin }>,
  ): string[] =>
    joins.flatMap(({ join }) => {
      const band = JOIN_BANDS[join.kind];
      return band != undefined && join.span != undefined
        ? [
            t(band.ariaKey, {
              start: formatDateShort(join.span.range.start),
              end: formatDateShort(join.span.range.end),
            }),
          ]
        : [];
    });

  return (
    <Box data-testid='coverage-comparison-rows'>
      {comparison.rows.map((row, index) => {
        const joins = getRowJoins(comparison.rows, index);
        return (
          <React.Fragment key={row.datasetId}>
            <Box sx={{ mt: index > 0 ? 0 : 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 1,
                  mb: 0.5,
                }}
              >
                <Typography variant='body2' color='text.secondary'>
                  {row.downloadedAt != undefined
                    ? t('sealContinuousDownloadedOn', {
                        date: formatDateShort(row.downloadedAt),
                      })
                    : t('sealContinuousDownloadedUnknown')}
                </Typography>
                {row.isLatest && (
                  <Chip
                    size='small'
                    color='primary'
                    variant='outlined'
                    label={t('sealContinuousLatestBadge')}
                    data-testid='coverage-latest-badge'
                  />
                )}
                {row.downloadUrl != undefined && (
                  <Button
                    variant='text'
                    size='small'
                    startIcon={<DownloadOutlined fontSize='small' />}
                    href={row.downloadUrl}
                    target='_blank'
                    rel='noreferrer nofollow'
                    data-testid='coverage-download-button'
                  >
                    {tCommon('download')}
                  </Button>
                )}
              </Box>

              {row.coverageWindow != undefined && (
                <Typography
                  variant='body2'
                  sx={{ fontWeight: 700, mb: 1, opacity: 0.9 }}
                >
                  {t('sealContinuousRangeCaption', {
                    start: formatDateShort(row.coverageWindow.start),
                    end: formatDateShort(row.coverageWindow.end),
                  })}
                </Typography>
              )}

              {row.tracks.length > 0 ? (
                row.tracks.map((track) => (
                  <Box key={track.source} sx={trackRowStyle}>
                    <Typography
                      variant='caption'
                      component='code'
                      sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}
                    >
                      {TRACK_LABELS[track.source]}
                    </Typography>
                    <TimelineTrack
                      ariaLabel={[
                        t('sealContinuousTrackLabel', {
                          source: TRACK_LABELS[track.source],
                          start: formatDateShort(track.window.start),
                          end: formatDateShort(track.window.end),
                        }),
                        // Only the bar the join was measured on carries it,
                        // so only that one describes it.
                        ...(track.isMeasured ? joinDescriptions(joins) : []),
                      ].join(' ')}
                      // Painted after the window bar so the bands sit on top
                      // of it, the way the required window does on Fresh.
                      segments={[
                        { id: track.source, ...track.placement, tone },
                        // A bar whose dates disagree with the coverage window
                        // is not what the join was measured on: banding it
                        // would claim days these dates do not share.
                        ...(track.isMeasured
                          ? joinSegments(joins, track.placement)
                          : []),
                      ]}
                    />
                  </Box>
                ))
              ) : (
                <Typography variant='caption' color='text.secondary'>
                  {t('sealContinuousNoWindows')}
                </Typography>
              )}
            </Box>

            {/* The join belongs to the newer dataset and describes how it
                meets the older one, so its wording sits under every row but
                the oldest. */}
            {row.join != undefined && <CoverageJoinNote join={row.join} />}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

/**
 * What the bands on the bars either side of it amount to: the days both
 * datasets cover, the days neither does, or windows that meet exactly - the
 * last of which has no band, since it encloses no day.
 *
 * Which of the three cases this is, and how many days it runs to, are the
 * API's verdict. A join with no span is one whose older dataset supplied no
 * window to draw it over; it has no band anywhere to name, so it is stated as
 * plain wording rather than as a chip pointing at one.
 */
async function CoverageJoinNote({
  join,
}: {
  join: CoverageJoin;
}): Promise<React.ReactElement> {
  const t = await getTranslations('feeds');
  const keys = JOIN_CAPTION_KEYS[join.kind];
  const placement =
    join.span != undefined
      ? placeAnnotationOnAxis(
          join.span.placement.leftPercent +
            join.span.placement.widthPercent / 2,
        )
      : undefined;

  return (
    <Box
      data-testid={`coverage-join-${join.kind}`}
      sx={{ ...trackRowStyle, my: 1.5, alignItems: 'start' }}
    >
      {/* Empty label cell, so the chip column lines up with the bars. */}
      <Box aria-hidden />
      {join.span != undefined && placement != undefined ? (
        // The padding narrows the box the chip is laid out in, which is what
        // centres it under the band rather than an offset that would let it
        // hang past either end of the track. A chip wider than that box is
        // centred `safe`ly, so instead of spilling off the track it rests
        // against the near edge - which is the end the row starts from.
        <Box
          sx={{
            display: 'flex',
            flexDirection: placement.flexDirection,
            justifyContent: 'center',
            '@supports (justify-content: safe center)': {
              justifyContent: 'safe center',
            },
            pl: `${placement.paddingLeftPercent}%`,
            pr: `${placement.paddingRightPercent}%`,
          }}
        >
          <Chip
            size='small'
            variant='outlined'
            color={JOIN_CHIP_COLORS[join.kind]}
            label={t(keys.detail, {
              days: join.days,
              start: formatDateShort(join.span.range.start),
              end: formatDateShort(join.span.range.end),
            })}
            sx={{
              // Chip labels are single-line by default, which would truncate
              // the dates rather than wrapping them in a narrowed box.
              height: 'auto',
              // A percentage here would resolve against the box above, which
              // a join near either end of the track narrows to almost
              // nothing - the flex layout would then shrink the chip down to
              // fit it, wrapping the label into an unreadable single-word
              // column instead of overflowing the box and resting `safe`ly
              // against the near edge, as intended. A fixed cap paired with
              // `flexShrink: 0` keeps it legible either way.
              maxWidth: 280,
              flexShrink: 0,
              py: 0.25,
              '& .MuiChip-label': { whiteSpace: 'normal', textAlign: 'center' },
            }}
          />
        </Box>
      ) : (
        <Typography variant='caption' sx={{ fontWeight: 600 }}>
          {t(keys.unshown, { days: join.days })}
        </Typography>
      )}
    </Box>
  );
}
