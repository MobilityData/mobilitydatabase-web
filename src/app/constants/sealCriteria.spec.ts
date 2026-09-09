import { theme } from '../Theme';
import {
  type ApiSealCriterionKey,
  PROBATION_MONTHS,
  getConsideredCriteria,
  getCriterionDisplayStatus,
  getCriterionStatusColor,
  getDaysUntil,
  getPassedCriteriaCount,
  getCriterionCopy,
  getProbationProgressPercent,
  getProbationWindow,
  getSealDisplayStatus,
  getSoonestGracePeriodEnd,
  isFeedWithinProbationWindow,
  joinWithAnd,
} from './sealCriteria';
import { type components } from '../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];

function buildCriterion(
  criterion: ApiSealCriterionKey,
  overrides: Partial<ReliabilityCriterion> = {},
): ReliabilityCriterion {
  return {
    criterion,
    status: 'pass',
    in_grace_period: false,
    on_probation: false,
    ...overrides,
  };
}

describe('getCriterionDisplayStatus', () => {
  it('prioritises probation over the raw status', () => {
    expect(
      getCriterionDisplayStatus(
        buildCriterion('official', { status: 'pass', on_probation: true }),
      ),
    ).toBe('probation');
  });

  it('prioritises probation over an active grace period', () => {
    expect(
      getCriterionDisplayStatus(
        buildCriterion('official', {
          status: 'fail',
          in_grace_period: true,
          on_probation: true,
        }),
      ),
    ).toBe('probation');
  });

  it('reports a failure inside its grace period as at-risk', () => {
    expect(
      getCriterionDisplayStatus(
        buildCriterion('stable', { status: 'fail', in_grace_period: true }),
      ),
    ).toBe('atRisk');
  });

  it('maps the raw statuses when neither flag is set', () => {
    expect(
      getCriterionDisplayStatus(buildCriterion('stable', { status: 'pass' })),
    ).toBe('pass');
    expect(
      getCriterionDisplayStatus(buildCriterion('stable', { status: 'fail' })),
    ).toBe('fail');
    expect(
      getCriterionDisplayStatus(
        buildCriterion('fresh_coverage', { status: 'not_applicable' }),
      ),
    ).toBe('notApplicable');
    expect(
      getCriterionDisplayStatus(
        buildCriterion('stable', { status: 'unknown' }),
      ),
    ).toBe('notEvaluated');
    expect(
      getCriterionDisplayStatus(
        buildCriterion('stable', { status: 'never_evaluated' }),
      ),
    ).toBe('notEvaluated');
  });
});

describe('criteria counting', () => {
  const criteria = [
    buildCriterion('official', { status: 'pass' }),
    buildCriterion('stable', { status: 'pass', on_probation: true }),
    buildCriterion('available', { status: 'fail' }),
    buildCriterion('fresh_coverage', { status: 'not_applicable' }),
  ];

  it('withdraws not_applicable criteria from the total', () => {
    expect(getConsideredCriteria(criteria).map((c) => c.criterion)).toEqual([
      'official',
      'stable',
      'available',
    ]);
  });

  it('does not count a passing criterion that is on probation', () => {
    expect(getPassedCriteriaCount(criteria)).toBe(1);
  });
});

describe('getSealDisplayStatus', () => {
  it('reports notEarned when there is no report', () => {
    expect(getSealDisplayStatus(undefined)).toBe('notEarned');
  });

  it('reports notEarned when the seal is not held', () => {
    expect(
      getSealDisplayStatus({
        feed_id: 'mdb-1',
        has_seal: false,
        on_probation: false,
        criteria: [buildCriterion('official')],
      }),
    ).toBe('notEarned');
  });

  it('reports probation when the seal is not held and probation is being served', () => {
    expect(
      getSealDisplayStatus({
        feed_id: 'mdb-1',
        has_seal: false,
        on_probation: true,
        criteria: [buildCriterion('official')],
      }),
    ).toBe('probation');
  });

  // The seal decides the headline: an at-risk criterion only reads as
  // "before it is disqualified" while the seal is still held.
  it('prefers the grace period over probation while the seal is held', () => {
    expect(
      getSealDisplayStatus({
        feed_id: 'mdb-1',
        has_seal: true,
        on_probation: true,
        criteria: [
          buildCriterion('available', {
            status: 'fail',
            in_grace_period: true,
          }),
        ],
      }),
    ).toBe('gracePeriod');
  });

  it('reports gracePeriod when the seal is held but a criterion is at risk', () => {
    expect(
      getSealDisplayStatus({
        feed_id: 'mdb-1',
        has_seal: true,
        on_probation: false,
        criteria: [
          buildCriterion('official'),
          buildCriterion('stable', { status: 'fail', in_grace_period: true }),
        ],
      }),
    ).toBe('gracePeriod');
  });

  it('reports earned when the seal is held with no grace periods', () => {
    expect(
      getSealDisplayStatus({
        feed_id: 'mdb-1',
        has_seal: true,
        on_probation: false,
        criteria: [buildCriterion('official')],
      }),
    ).toBe('earned');
  });
});

describe('getCriterionStatusColor', () => {
  it('maps each display status to its palette CSS variable', () => {
    expect(getCriterionStatusColor('pass')).toBe(
      theme.vars.palette.success.main,
    );
    expect(getCriterionStatusColor('atRisk')).toBe(
      theme.vars.palette.warning.main,
    );
    expect(getCriterionStatusColor('fail')).toBe(theme.vars.palette.error.main);
    expect(getCriterionStatusColor('probation')).toBe(
      theme.vars.palette.info.main,
    );
    expect(getCriterionStatusColor('notApplicable')).toBe(
      theme.vars.palette.grey[500],
    );
    expect(getCriterionStatusColor('notEvaluated')).toBe(
      theme.vars.palette.grey[500],
    );
  });
});

describe('getSoonestGracePeriodEnd', () => {
  it('returns the nearest deadline among the at-risk criteria', () => {
    expect(
      getSoonestGracePeriodEnd([
        buildCriterion('available', {
          status: 'fail',
          in_grace_period: true,
          grace_period_ends_at: '2026-09-20T00:00:00Z',
        }),
        buildCriterion('compliant', {
          status: 'fail',
          in_grace_period: true,
          grace_period_ends_at: '2026-09-12T00:00:00Z',
        }),
      ]),
    ).toBe('2026-09-12T00:00:00Z');
  });

  it('ignores criteria that are not in a grace period', () => {
    expect(
      getSoonestGracePeriodEnd([
        buildCriterion('available', { status: 'fail' }),
        buildCriterion('official', { status: 'pass' }),
      ]),
    ).toBeUndefined();
  });

  it('returns undefined when an at-risk criterion reports no deadline', () => {
    expect(
      getSoonestGracePeriodEnd([
        buildCriterion('available', { status: 'fail', in_grace_period: true }),
      ]),
    ).toBeUndefined();
  });
});

describe('getDaysUntil', () => {
  const now = new Date('2026-09-08T12:00:00Z');

  it('counts whole calendar days ahead', () => {
    expect(getDaysUntil('2026-09-20T00:00:00Z', now)).toBe(12);
  });

  it('floors an elapsed deadline at 0 rather than going negative', () => {
    expect(getDaysUntil('2026-09-01T00:00:00Z', now)).toBe(0);
  });
});

describe('getProbationWindow', () => {
  it('derives the start from the end minus the probation length', () => {
    const probationWindow = getProbationWindow({
      feed_id: 'mdb-1',
      has_seal: false,
      on_probation: true,
      probation_ends_at: '2027-01-16T00:00:00Z',
      criteria: [],
    });

    expect(probationWindow?.end.toISOString()).toBe('2027-01-16T00:00:00.000Z');
    expect(probationWindow?.start.toISOString()).toBe(
      '2026-07-16T00:00:00.000Z',
    );
    expect(PROBATION_MONTHS).toBe(6);
  });

  it('returns undefined when the API reports no end date', () => {
    expect(
      getProbationWindow({
        feed_id: 'mdb-1',
        has_seal: false,
        on_probation: true,
        criteria: [],
      }),
    ).toBeUndefined();
  });
});

describe('getProbationProgressPercent', () => {
  const probationWindow = {
    start: new Date('2026-07-16T00:00:00Z'),
    end: new Date('2027-01-16T00:00:00Z'),
  };

  it('reports how far through the window now sits', () => {
    expect(
      getProbationProgressPercent(
        probationWindow,
        new Date('2026-10-16T00:00:00Z'),
      ),
    ).toBeCloseTo(50, 0);
  });

  it('clamps outside the window', () => {
    expect(
      getProbationProgressPercent(
        probationWindow,
        new Date('2026-01-01T00:00:00Z'),
      ),
    ).toBe(0);
    expect(
      getProbationProgressPercent(
        probationWindow,
        new Date('2028-01-01T00:00:00Z'),
      ),
    ).toBe(100);
  });
});

describe('joinWithAnd', () => {
  it('formats lists of one, two and three', () => {
    expect(joinWithAnd(['Compliant'], 'and')).toBe('Compliant');
    expect(joinWithAnd(['Compliant', 'Available'], 'and')).toBe(
      'Compliant and Available',
    );
    expect(joinWithAnd(['Compliant', 'Available', 'Fresh'], 'and')).toBe(
      'Compliant, Available and Fresh',
    );
  });

  it('returns an empty string for an empty list', () => {
    expect(joinWithAnd([], 'and')).toBe('');
  });
});

describe('isFeedWithinProbationWindow', () => {
  const now = new Date('2026-09-08T00:00:00Z');

  it('is true for a feed younger than the probation length', () => {
    expect(isFeedWithinProbationWindow('2026-07-01T00:00:00Z', now)).toBe(true);
  });

  it('is false for a feed older than the probation length', () => {
    expect(isFeedWithinProbationWindow('2025-01-01T00:00:00Z', now)).toBe(
      false,
    );
  });

  it('is false without a usable created date', () => {
    expect(isFeedWithinProbationWindow(undefined, now)).toBe(false);
    expect(isFeedWithinProbationWindow(null, now)).toBe(false);
    expect(isFeedWithinProbationWindow('not a date', now)).toBe(false);
  });
});

describe('getCriterionCopy', () => {
  const now = new Date('2026-09-08T00:00:00Z');
  const recentlyAdded = '2026-07-01T00:00:00Z';
  const longEstablished = '2024-01-01T00:00:00Z';

  it('uses the criterion default copy when nothing special applies', () => {
    expect(
      getCriterionCopy(buildCriterion('available', { status: 'fail' })),
    ).toMatchObject({
      variant: 'default',
      titleKey: 'criteria.available.title',
      subtitleKey: 'criteria.available.subtitle',
      descriptionKey: 'criteria.available.description',
    });
  });

  describe('stable', () => {
    it('reports a flagged producer URL whatever the status', () => {
      for (const status of ['pass', 'fail'] as const) {
        expect(
          getCriterionCopy(buildCriterion('stable', { status }), {
            isProducerUrlUnstable: true,
            feedCreatedAt: longEstablished,
            now,
          }),
        ).toMatchObject({
          variant: 'unstableUrl',
          subtitleKey: 'criteria.stable.unstableUrlSubtitle',
          descriptionKey: 'criteria.stable.unstableUrlDescription',
        });
      }
    });

    it('reads as building a record when a young feed has not passed yet', () => {
      expect(
        getCriterionCopy(buildCriterion('stable', { status: 'fail' }), {
          isProducerUrlUnstable: false,
          feedCreatedAt: recentlyAdded,
          now,
        }),
      ).toMatchObject({
        variant: 'buildingRecord',
        subtitleKey: 'criteria.stable.buildingRecordSubtitle',
        descriptionKey: 'criteria.stable.buildingRecordDescription',
      });
    });

    it('treats a null flag the same as false', () => {
      expect(
        getCriterionCopy(buildCriterion('stable', { status: 'fail' }), {
          isProducerUrlUnstable: null,
          feedCreatedAt: recentlyAdded,
          now,
        }).variant,
      ).toBe('buildingRecord');
    });

    it('keeps the default copy for a passing URL', () => {
      expect(
        getCriterionCopy(buildCriterion('stable', { status: 'pass' }), {
          isProducerUrlUnstable: false,
          feedCreatedAt: recentlyAdded,
          now,
        }).variant,
      ).toBe('default');
    });

    // The gap in the spec: failing, not flagged, and old enough that
    // "building its record" would be untrue.
    it('falls back to the default copy for an established failing feed', () => {
      expect(
        getCriterionCopy(buildCriterion('stable', { status: 'fail' }), {
          isProducerUrlUnstable: false,
          feedCreatedAt: longEstablished,
          now,
        }).variant,
      ).toBe('default');
    });
  });

  describe('official', () => {
    it('reads as unauthorized when it fails', () => {
      expect(
        getCriterionCopy(buildCriterion('official', { status: 'fail' })),
      ).toMatchObject({
        variant: 'notAuthorized',
        subtitleKey: 'criteria.official.notAuthorizedSubtitle',
        descriptionKey: 'criteria.official.notAuthorizedDescription',
      });
    });

    it('keeps the default copy for every other state', () => {
      for (const status of [
        'pass',
        'unknown',
        'never_evaluated',
        'not_applicable',
      ] as const) {
        expect(
          getCriterionCopy(buildCriterion('official', { status })).variant,
        ).toBe('default');
      }
    });
  });
});
