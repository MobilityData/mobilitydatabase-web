import {
  buildCoverageAxis,
  buildCoverageComparison,
  getContinuousCoverageSummary,
  getCoverageViolation,
  getUndisplayedHistoryNote,
  getCoverageWindowLength,
  getCoverageWindowTooltip,
  getDistinctFailureBoundary,
} from './continuous-coverage';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type ContinuousCoverage = components['schemas']['GtfsFeedContinuousCoverage'];
type ContinuousCoverageBoundary =
  components['schemas']['GtfsFeedContinuousCoverageBoundary'];
type ContinuousCoverageResponse =
  components['schemas']['GtfsFeedContinuousCoverageResponse'];

const NOW = new Date('2026-09-11T12:00:00Z');

function criterion(
  overrides: Partial<ReliabilityCriterion> = {},
): ReliabilityCriterion {
  return {
    criterion: 'fresh_continuous',
    status: 'pass',
    in_grace_period: false,
    on_probation: false,
    ...overrides,
  };
}

function entry(
  overrides: Partial<ContinuousCoverage> = {},
): ContinuousCoverage {
  return {
    dataset_id: 'd2',
    is_latest: true,
    downloaded_at: '2026-06-28T00:29:00Z',
    coverage_window: { start: '2026-09-16', end: '2027-07-28', days: 316 },
    service_window: { start: '2026-09-16', end: '2027-07-28' },
    feed_info_window: { start: '2026-09-16', end: '2027-07-28' },
    feed_info_matches: true,
    previous_dataset_id: 'd1',
    overlap_days: 15,
    within_max_coverage_window: true,
    files: [
      { name: 'feed_info.txt', present: true },
      { name: 'calendar.txt', present: true },
      { name: 'calendar_dates.txt', present: true },
    ],
    ...overrides,
  };
}

const previousEntry = entry({
  dataset_id: 'd1',
  is_latest: false,
  downloaded_at: '2026-04-29T00:29:00Z',
  coverage_window: { start: '2026-05-01', end: '2026-09-30', days: 153 },
  service_window: { start: '2026-05-01', end: '2026-09-30' },
  feed_info_window: { start: '2026-05-01', end: '2026-09-30' },
  previous_dataset_id: null,
  overlap_days: null,
});

/** The pair of datasets a comparison is drawn from. */
function boundary(
  newer: ContinuousCoverage,
  older?: ContinuousCoverage,
): ContinuousCoverageBoundary {
  return { newer, ...(older != undefined && { older }) };
}

function response(
  overrides: Partial<ContinuousCoverageResponse> = {},
): ContinuousCoverageResponse {
  return {
    feed_id: 'mdb-1',
    total: 2,
    offset: 0,
    limit: 20,
    latest_state: boundary(entry(), previousEntry),
    items: [entry(), previousEntry],
    ...overrides,
  };
}

describe('getCoverageWindowLength', () => {
  it('reads a long window in years, to one decimal', () => {
    expect(
      getCoverageWindowLength({
        start: '2026-09-16',
        end: '2027-07-28',
        days: 589,
      }),
    ).toEqual({ key: 'sealContinuousWindowChipYears', values: { years: 1.6 } });
  });

  it('reads a mid-length window in months', () => {
    expect(
      getCoverageWindowLength({
        start: '2026-05-01',
        end: '2026-09-30',
        days: 153,
      }),
    ).toEqual({ key: 'sealContinuousWindowChipMonths', values: { months: 5 } });
  });

  it('reads a short window in days', () => {
    expect(
      getCoverageWindowLength({
        start: '2026-05-01',
        end: '2026-05-10',
        days: 10,
      }),
    ).toEqual({ key: 'sealContinuousWindowChipDays', values: { days: 10 } });
  });

  it('derives the length from inclusive bounds when the API omits it', () => {
    expect(
      getCoverageWindowLength({ start: '2026-05-01', end: '2026-05-10' }),
    ).toEqual({ key: 'sealContinuousWindowChipDays', values: { days: 10 } });
  });

  it('is undefined for a missing or reversed window', () => {
    expect(getCoverageWindowLength(undefined)).toBeUndefined();
    expect(
      getCoverageWindowLength({ start: '2026-05-10', end: '2026-05-01' }),
    ).toBeUndefined();
  });
});

describe('getCoverageWindowTooltip', () => {
  it('states the limit, and which side of it the window falls on', () => {
    expect(getCoverageWindowTooltip(true)).toEqual({
      key: 'sealContinuousWindowTooltipWithin',
      values: { years: 2 },
    });
    expect(getCoverageWindowTooltip(false)).toEqual({
      key: 'sealContinuousWindowTooltipOver',
      values: { years: 2 },
    });
  });

  it('states the limit alone when the API reached no verdict', () => {
    // Null is "there was no window to measure", not "it failed" - and the
    // criterion's own status cannot stand in, since it can be failing for a
    // gap while the window itself is fine.
    for (const unknown of [null, undefined]) {
      expect(getCoverageWindowTooltip(unknown)).toEqual({
        key: 'sealContinuousWindowTooltip',
        values: { years: 2 },
      });
    }
  });
});

describe('buildCoverageAxis', () => {
  it('spans every window of every entry, with padding at each end', () => {
    const axis = buildCoverageAxis([previousEntry, entry()]);
    expect(axis?.start != null && axis.start < '2026-05-01').toBe(true);
    expect(axis?.end != null && axis.end > '2027-07-28').toBe(true);
  });

  it('is undefined when no entry supplied a window', () => {
    expect(
      buildCoverageAxis([
        {
          dataset_id: 'd0',
          is_latest: true,
          files: [],
        },
      ]),
    ).toBeUndefined();
  });
});

describe('buildCoverageComparison', () => {
  it('places the latest dataset first and both on the same axis', () => {
    const comparison = buildCoverageComparison(
      boundary(entry(), previousEntry),
    );
    expect(comparison?.rows.map((row) => row.datasetId)).toEqual(['d2', 'd1']);
    expect(comparison?.rows.map((row) => row.isLatest)).toEqual([true, false]);
    // The join belongs to the newer row and reaches down to the older one,
    // which has nothing beneath it to join to.
    expect(comparison?.rows[0].join?.kind).toBe('overlap');
    expect(comparison?.rows[1].join).toBeUndefined();
    expect(comparison?.rows[0].tracks.map((t) => t.source)).toEqual([
      'feedInfo',
      'calendar',
    ]);
  });

  it('spans an overlap over the days both datasets cover', () => {
    const comparison = buildCoverageComparison(
      boundary(entry(), previousEntry),
    );
    const join = comparison?.rows[0].join;
    expect(join).toMatchObject({ kind: 'overlap', days: 15 });
    // The newer window starts inside the older one, which ends first.
    expect(join?.span?.range).toEqual({
      start: '2026-09-16',
      end: '2026-09-30',
    });
    expect(join?.span?.placement.widthPercent).toBeGreaterThan(0);
  });

  it('spans a gap over the uncovered days between the two windows', () => {
    const failing = entry({
      coverage_window: { start: '2026-10-04', end: '2027-07-28' },
      service_window: { start: '2026-10-04', end: '2027-07-28' },
      feed_info_window: { start: '2026-10-04', end: '2027-07-28' },
      overlap_days: null,
      gap_days: 3,
    });
    const comparison = buildCoverageComparison(
      boundary(failing, previousEntry),
    );
    expect(comparison?.rows[0].join).toMatchObject({ kind: 'gap', days: 3 });
    // The older window ends Sept 30 and the newer picks up Oct 4, so the
    // uncovered days are the three in between.
    expect(comparison?.rows[0].join?.span?.range).toEqual({
      start: '2026-10-01',
      end: '2026-10-03',
    });
  });

  it('marks windows that meet exactly as a boundary with no width', () => {
    const meeting = entry({
      coverage_window: { start: '2026-10-01', end: '2027-07-28' },
      service_window: { start: '2026-10-01', end: '2027-07-28' },
      feed_info_window: { start: '2026-10-01', end: '2027-07-28' },
      overlap_days: 0,
    });
    const comparison = buildCoverageComparison(
      boundary(meeting, previousEntry),
    );
    const join = comparison?.rows[0].join;
    expect(join).toMatchObject({ kind: 'meets', days: 0 });
    expect(join?.span?.range).toEqual({
      start: '2026-10-01',
      end: '2026-10-01',
    });
    expect(join?.span?.placement.widthPercent).toBe(0);
  });

  it('draws a single row when the boundary reports no older dataset', () => {
    const comparison = buildCoverageComparison(boundary(entry()));
    expect(comparison?.rows).toHaveLength(1);
    // The join is still reported, so it can be stated without a span to draw
    // it over.
    expect(comparison?.rows[0].join).toMatchObject({
      kind: 'overlap',
      days: 15,
    });
    expect(comparison?.rows[0].join?.span).toBeUndefined();
  });

  it('marks only the bar the coverage window was measured on', () => {
    // feed_info wins the coverage window under the API's precedence, and the
    // calendar files declare something else - so the join belongs on the
    // feed_info bar alone.
    const comparison = buildCoverageComparison(
      boundary(
        entry({
          coverage_window: { start: '2026-09-16', end: '2027-07-28' },
          feed_info_window: { start: '2026-09-16', end: '2027-07-28' },
          service_window: { start: '2026-09-20', end: '2027-07-01' },
          feed_info_matches: false,
        }),
        previousEntry,
      ),
    );
    expect(
      comparison?.rows[0].tracks.map((track) => [
        track.source,
        track.isMeasured,
      ]),
    ).toEqual([
      ['feedInfo', true],
      ['calendar', false],
    ]);
  });

  it('marks both bars when the two windows agree', () => {
    const comparison = buildCoverageComparison(
      boundary(entry(), previousEntry),
    );
    expect(comparison?.rows[0].tracks.every((track) => track.isMeasured)).toBe(
      true,
    );
  });

  it('omits a track for a window the dataset did not supply', () => {
    const comparison = buildCoverageComparison(
      boundary(entry({ feed_info_window: undefined, feed_info_matches: null })),
    );
    expect(comparison?.rows[0].tracks.map((t) => t.source)).toEqual([
      'calendar',
    ]);
  });

  it('is undefined without a boundary, or without any window to draw', () => {
    expect(buildCoverageComparison(undefined)).toBeUndefined();
    expect(
      buildCoverageComparison(
        boundary({ dataset_id: 'd0', is_latest: true, files: [] }),
      ),
    ).toBeUndefined();
  });
});

describe('getCoverageViolation', () => {
  it('names the rule that broke', () => {
    expect(getCoverageViolation(entry({ gap_days: 3 }))).toBe('gap');
    expect(
      getCoverageViolation(entry({ within_max_coverage_window: false })),
    ).toBe('window');
  });

  it('reads a zero-day gap as no violation - the windows meet exactly', () => {
    expect(getCoverageViolation(entry({ gap_days: 0 }))).toBeUndefined();
  });

  it('is undefined for a healthy entry, and for no entry', () => {
    expect(getCoverageViolation(entry())).toBeUndefined();
    expect(getCoverageViolation(undefined)).toBeUndefined();
  });
});

describe('getDistinctFailureBoundary', () => {
  it('is undefined when the failure is the latest dataset, already on screen', () => {
    expect(
      getDistinctFailureBoundary(
        response({
          latest_failure: boundary(entry(), previousEntry),
          latest_state: boundary(entry(), previousEntry),
        }),
      ),
    ).toBeUndefined();
  });

  it('returns an older failing pair the latest one would not explain', () => {
    const failure = boundary(entry({ dataset_id: 'd0', gap_days: 4 }));
    expect(
      getDistinctFailureBoundary(response({ latest_failure: failure })),
    ).toEqual(failure);
  });

  it('keeps a failure regardless of how long ago it happened', () => {
    // The endpoint only reports `latest_failure` when it is still relevant
    // to the criterion's verdict, so the page defers to it rather than
    // hiding it again behind an age check of its own.
    const failure = boundary(
      entry({
        dataset_id: 'd0',
        downloaded_at: '2025-08-12T00:29:00Z',
        gap_days: 4,
      }),
    );
    expect(
      getDistinctFailureBoundary(response({ latest_failure: failure })),
    ).toEqual(failure);
  });

  it('keeps a failure whose older dataset predates it by a long stretch', () => {
    // The older dataset is only there to draw the join against, and a
    // comparison needs both sides.
    const failure = boundary(
      entry({ dataset_id: 'd0', gap_days: 4 }),
      entry({ dataset_id: 'd-1', downloaded_at: '2025-05-24T00:29:00Z' }),
    );
    expect(
      getDistinctFailureBoundary(response({ latest_failure: failure })),
    ).toEqual(failure);
  });

  it('keeps an undated failure rather than hiding it on a missing field', () => {
    const failure = boundary(
      entry({ dataset_id: 'd0', downloaded_at: null, gap_days: 4 }),
    );
    expect(
      getDistinctFailureBoundary(response({ latest_failure: failure })),
    ).toEqual(failure);
  });
});

describe('getUndisplayedHistoryNote', () => {
  it('owns up to the window holding more datasets than are drawn', () => {
    expect(
      getUndisplayedHistoryNote(criterion(), response({ total: 9 }), 2),
    ).toEqual({
      key: 'sealContinuousMoreHistory',
      values: { datasets: 9, months: 6 },
    });
  });

  it('says nothing when every dataset of the window is already drawn', () => {
    expect(
      getUndisplayedHistoryNote(criterion(), response({ total: 2 }), 2),
    ).toBeUndefined();
  });

  it('says nothing while the criterion is failing or at risk', () => {
    for (const failing of [
      criterion({ status: 'fail' }),
      criterion({ in_grace_period: true }),
    ]) {
      expect(
        getUndisplayedHistoryNote(failing, response({ total: 9 }), 2),
      ).toBeUndefined();
    }
  });

  it('says nothing when a distinct failure is drawn below it', () => {
    expect(
      getUndisplayedHistoryNote(
        criterion(),
        response({
          total: 9,
          latest_failure: boundary(entry({ dataset_id: 'd0', gap_days: 4 })),
        }),
        2,
      ),
    ).toBeUndefined();
  });

  it('says nothing for a failure the API still reports, however old', () => {
    // Reverting the age check means an old failure counts the same as a
    // recent one: it contradicts the "rest of the window is clean" claim
    // either way, so the note stays withheld rather than drawn.
    const staleFailure = boundary(
      entry({ dataset_id: 'd0', downloaded_at: '2025-08-12T00:29:00Z' }),
    );
    expect(
      getUndisplayedHistoryNote(
        criterion({ on_probation: true }),
        response({ total: 9, latest_failure: staleFailure }),
        2,
      ),
    ).toBeUndefined();
  });

  it('says nothing when the drawn pair itself breaks, verdict or not', () => {
    // The API's verdict is debounced, so a gap can be on screen while the
    // criterion still reads pass.
    expect(
      getUndisplayedHistoryNote(
        criterion(),
        response({
          total: 9,
          latest_state: boundary(entry({ gap_days: 4 }), previousEntry),
        }),
        2,
      ),
    ).toBeUndefined();
  });

  it('still speaks for a feed on probation once the API drops the distinct failure', () => {
    expect(
      getUndisplayedHistoryNote(
        criterion({ on_probation: true }),
        response({ total: 9 }),
        2,
      ),
    ).toMatchObject({ key: 'sealContinuousMoreHistory' });
  });

  it('says nothing without a coverage response at all', () => {
    expect(
      getUndisplayedHistoryNote(criterion(), undefined, 0),
    ).toBeUndefined();
  });
});

describe('getContinuousCoverageSummary', () => {
  it('states the overlap while passing', () => {
    expect(getContinuousCoverageSummary(criterion(), response(), NOW)).toEqual({
      subtitleKey: 'sealContinuousContinuousSubtitle',
      key: 'sealContinuousPassing',
      values: { days: 15, years: 2 },
    });
  });

  it('separates windows that meet exactly from a feed with one dataset', () => {
    expect(
      getContinuousCoverageSummary(
        criterion(),
        response({ latest_state: boundary(entry({ overlap_days: 0 })) }),
        NOW,
      ).key,
    ).toBe('sealContinuousPassingNoOverlap');

    expect(
      getContinuousCoverageSummary(
        criterion(),
        response({
          latest_state: boundary(
            entry({ previous_dataset_id: null, overlap_days: null }),
          ),
        }),
        NOW,
      ).key,
    ).toBe('sealContinuousPassingSingle');
  });

  it('explains a gap with the dataset that opened it', () => {
    const failure = entry({
      dataset_id: 'd0',
      downloaded_at: '2026-03-02T00:29:00Z',
      gap_days: 31,
      overlap_days: null,
    });
    expect(
      getContinuousCoverageSummary(
        criterion({ status: 'fail' }),
        response({ latest_failure: boundary(failure) }),
        NOW,
      ),
    ).toEqual({
      subtitleKey: 'sealContinuousGapSubtitle',
      key: 'sealContinuousGapFailing',
      values: { days: 31, date: 'Mar 2, 2026' },
    });
  });

  it('explains an over-long service window', () => {
    const failure = entry({
      downloaded_at: '2026-06-28T00:29:00Z',
      within_max_coverage_window: false,
    });
    expect(
      getContinuousCoverageSummary(
        criterion({ status: 'fail' }),
        response({ latest_failure: boundary(failure) }),
        NOW,
      ),
    ).toEqual({
      subtitleKey: 'sealContinuousWindowSubtitle',
      key: 'sealContinuousWindowFailing',
      values: { years: 2, date: 'Jun 28, 2026' },
    });
  });

  it('falls back to undated wording when no failing dataset is reported', () => {
    expect(
      getContinuousCoverageSummary(
        criterion({ status: 'fail' }),
        response({ latest_state: undefined, latest_failure: undefined }),
        NOW,
      ),
    ).toEqual({
      subtitleKey: 'sealContinuousGapSubtitle',
      key: 'sealContinuousFailingUndated',
      values: { years: 2 },
    });
  });

  it('carries a grace countdown if the API ever reports one', () => {
    // The criterion is documented as having no grace period; this is the
    // defensive path, so the deadline is never silently dropped.
    const summary = getContinuousCoverageSummary(
      criterion({
        in_grace_period: true,
        grace_period_ends_at: '2026-09-20T04:00:00Z',
      }),
      response({ latest_failure: boundary(entry({ gap_days: 2 })) }),
      NOW,
    );
    expect(summary.graceDaysLeft).toBe(9);
  });

  it('dates the last failure while on probation, and drops it when absent', () => {
    expect(
      getContinuousCoverageSummary(
        criterion({
          on_probation: true,
          last_failure_at: '2026-06-02T04:00:00Z',
        }),
        response(),
        NOW,
      ),
    ).toEqual({
      subtitleKey: 'sealContinuousContinuousSubtitle',
      key: 'sealContinuousProbation',
      values: { date: 'Jun 2, 2026' },
    });

    expect(
      getContinuousCoverageSummary(
        criterion({ on_probation: true }),
        response(),
        NOW,
      ).key,
    ).toBe('sealContinuousProbationUndated');
  });

  it('covers not applicable, never evaluated and no history', () => {
    expect(
      getContinuousCoverageSummary(
        criterion({ status: 'not_applicable' }),
        response(),
        NOW,
      ).key,
    ).toBe('sealContinuousNotApplicable');

    expect(
      getContinuousCoverageSummary(
        criterion({ status: 'never_evaluated' }),
        response(),
        NOW,
      ).key,
    ).toBe('sealContinuousNoData');

    expect(getContinuousCoverageSummary(criterion(), undefined, NOW).key).toBe(
      'sealContinuousNoHistory',
    );
  });
});
