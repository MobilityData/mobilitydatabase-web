import {
  MAX_ERROR_ROWS,
  buildValidationErrorsModel,
  humanizeNoticeCode,
} from './validation-notices';
import { type components } from '../../../services/feeds/types';

type FeedValidationReport = components['schemas']['GtfsFeedValidationReport'];
type Notice = components['schemas']['GtfsFeedValidationNotice'];

function notice(
  code: string,
  severity: Notice['severity'],
  total: number,
): Notice {
  return { code, severity, total };
}

function reportOf(
  overrides: Partial<FeedValidationReport> & { dataset_id: string },
): FeedValidationReport {
  return { is_latest: false, notices: [], ...overrides };
}

const latest = reportOf({
  dataset_id: 'mdb-1-003',
  is_latest: true,
  validated_at: '2026-06-03T00:00:00Z',
  url_html: 'https://reports.example.com/003.html',
  notices: [
    notice('invalid_color', 'ERROR', 3),
    notice('missing_required_field', 'ERROR', 47),
    notice('unused_shape', 'WARNING', 900),
  ],
});

const older = reportOf({
  dataset_id: 'mdb-1-002',
  validated_at: '2026-06-01T00:00:00Z',
  notices: [notice('missing_required_field', 'ERROR', 47)],
});

const response = {
  feed_id: 'mdb-1',
  latest,
  total: 2,
  offset: 0,
  limit: 20,
  items: [latest, older],
};

const rules = {
  missing_required_field: {
    summary: 'A required field is missing.',
    files: ['trips.txt'],
  },
};

describe('buildValidationErrorsModel', () => {
  it('returns an empty model when there is no response', () => {
    const model = buildValidationErrorsModel(undefined);

    expect(model.rows).toEqual([]);
    expect(model.datasetId).toBeUndefined();
    expect(model.newCount).toBe(0);
    expect(model.carriedCount).toBe(0);
  });

  it('returns an empty model when the history carries no datasets', () => {
    expect(
      buildValidationErrorsModel({ ...response, latest: undefined, items: [] })
        .rows,
    ).toEqual([]);
  });

  it('lists only errors, most raised first', () => {
    const model = buildValidationErrorsModel(response, rules);

    expect(model.rows.map((row) => row.code)).toEqual([
      'missing_required_field',
      'invalid_color',
    ]);
  });

  it('drops warnings and info even when they are raised far more often', () => {
    const model = buildValidationErrorsModel(response, rules);

    expect(model.rows.some((row) => row.code === 'unused_shape')).toBe(false);
  });

  it('lists nothing when the dataset has no errors, but keeps the dataset', () => {
    // The panel still shows the download and report links for a passing
    // criterion, so it needs the dataset even with an empty list.
    const clean = reportOf({
      dataset_id: 'mdb-1-004',
      is_latest: true,
      validated_at: '2026-06-04T00:00:00Z',
      url_html: 'https://reports.example.com/004.html',
      notices: [notice('unused_shape', 'WARNING', 2)],
    });
    const model = buildValidationErrorsModel({
      ...response,
      latest: clean,
      items: [clean],
    });

    expect(model.rows).toEqual([]);
    expect(model.datasetId).toBe('mdb-1-004');
    expect(model.validatedAt).toBe('2026-06-04T00:00:00Z');
    expect(model.reportUrl).toBe('https://reports.example.com/004.html');
  });

  it('joins the validator wording and file onto a code', () => {
    const model = buildValidationErrorsModel(response, rules);

    expect(model.rows[0].summary).toBe('A required field is missing.');
    expect(model.rows[0].files).toEqual(['trips.txt']);
  });

  it('leaves a code with no rule entry without wording, rather than guessing', () => {
    const model = buildValidationErrorsModel(response, rules);
    const row = model.rows.find((r) => r.code === 'invalid_color');

    expect(row?.summary).toBeUndefined();
    expect(row?.files).toEqual([]);
  });

  it('marks a code absent from every earlier dataset as new', () => {
    const model = buildValidationErrorsModel(response, rules);

    expect(model.rows.find((r) => r.code === 'invalid_color')?.isNew).toBe(
      true,
    );
    expect(
      model.rows.find((r) => r.code === 'missing_required_field')?.isNew,
    ).toBe(false);
    expect(model.newCount).toBe(1);
    expect(model.carriedCount).toBe(1);
  });

  it('counts a code carried at any severity as carried, not new', () => {
    // The code was a warning before and an error now; it is still not new.
    const wasWarning = reportOf({
      dataset_id: 'mdb-1-002',
      validated_at: '2026-06-01T00:00:00Z',
      notices: [notice('invalid_color', 'WARNING', 1)],
    });
    const model = buildValidationErrorsModel(
      { ...response, items: [latest, wasWarning] },
      rules,
    );

    expect(model.rows.find((r) => r.code === 'invalid_color')?.isNew).toBe(
      false,
    );
  });

  it('treats every code as new when the history holds only this dataset', () => {
    const model = buildValidationErrorsModel(
      { ...response, items: [latest] },
      rules,
    );

    expect(model.newCount).toBe(2);
    expect(model.carriedCount).toBe(0);
  });

  it('carries the dataset id, date and report URL through', () => {
    const model = buildValidationErrorsModel(response, rules);

    expect(model.datasetId).toBe('mdb-1-003');
    expect(model.validatedAt).toBe('2026-06-03T00:00:00Z');
    expect(model.reportUrl).toBe('https://reports.example.com/003.html');
  });

  it('falls back to the newest dataset when the API flags none as latest', () => {
    // Real feeds come back with `latest: null` and `is_latest` false on every
    // entry.
    const model = buildValidationErrorsModel(
      {
        ...response,
        latest: undefined,
        items: [
          reportOf({ ...older, is_latest: false }),
          reportOf({ ...latest, is_latest: false }),
        ],
      },
      rules,
    );

    expect(model.datasetId).toBe('mdb-1-003');
  });

  it('prefers the flagged item over the newest when the API sets one', () => {
    const model = buildValidationErrorsModel(
      {
        ...response,
        latest: undefined,
        items: [
          reportOf({ ...latest, is_latest: false }),
          reportOf({ ...older, is_latest: true }),
        ],
      },
      rules,
    );

    expect(model.datasetId).toBe('mdb-1-002');
  });

  it('does not count the shown dataset as one of its own earlier datasets', () => {
    const model = buildValidationErrorsModel(
      {
        ...response,
        latest: undefined,
        items: [reportOf({ ...latest, is_latest: false })],
      },
      rules,
    );

    expect(model.rows.every((row) => row.isNew)).toBe(true);
  });
});

describe('humanizeNoticeCode', () => {
  it('reads a snake_case code as a sentence', () => {
    expect(humanizeNoticeCode('missing_required_field')).toBe(
      'Missing required field',
    );
  });

  it('leaves a code with no separators alone beyond its first letter', () => {
    expect(humanizeNoticeCode('duplicate')).toBe('Duplicate');
  });

  it('returns an empty code untouched', () => {
    expect(humanizeNoticeCode('')).toBe('');
  });
});

describe('the top-errors cap', () => {
  const many = (count: number) =>
    reportOf({
      dataset_id: 'mdb-1-010',
      is_latest: true,
      notices: Array.from({ length: count }, (_, index) =>
        notice(`code_${index}`, 'ERROR', count - index),
      ),
    });

  it('lists at most the five most raised errors', () => {
    const report = many(12);
    const model = buildValidationErrorsModel({
      ...response,
      latest: report,
      items: [report],
    });

    expect(model.rows).toHaveLength(MAX_ERROR_ROWS);
    expect(model.rows.map((row) => row.code)).toEqual([
      'code_0',
      'code_1',
      'code_2',
      'code_3',
      'code_4',
    ]);
  });

  it('reports the full count so the sentence above the list stays right', () => {
    const report = many(12);
    const model = buildValidationErrorsModel({
      ...response,
      latest: report,
      items: [report],
    });

    expect(model.totalCount).toBe(12);
  });

  it('counts new and carried over every error, not just the listed ones', () => {
    const report = many(12);
    const earlier = reportOf({
      dataset_id: 'mdb-1-009',
      notices: [notice('code_11', 'ERROR', 1)],
    });
    const model = buildValidationErrorsModel({
      ...response,
      latest: report,
      items: [report, earlier],
    });

    // code_11 is the least raised, so it falls outside the five shown, but
    // it is still the one carried error.
    expect(model.carriedCount).toBe(1);
    expect(model.newCount).toBe(11);
  });

  it('leaves a short list untouched', () => {
    const report = many(3);
    const model = buildValidationErrorsModel({
      ...response,
      latest: report,
      items: [report],
    });

    expect(model.rows).toHaveLength(3);
    expect(model.totalCount).toBe(3);
  });
});
