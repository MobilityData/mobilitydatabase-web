/**
 * @jest-environment node
 */

jest.mock('server-only', () => ({}));

import { getValidatorRuleUrl, parseValidatorRules } from './validator-rules';

describe('parseValidatorRules', () => {
  it('reads the summary and file references of a rule', () => {
    const rules = parseValidatorRules({
      invalid_color: {
        shortSummary: 'A color is invalid.',
        references: { fileReferences: ['routes.txt'] },
      },
    });

    expect(rules.invalid_color).toEqual({
      summary: 'A color is invalid.',
      files: ['routes.txt'],
    });
  });

  it('leaves the summary absent when the rule carries an empty one', () => {
    const rules = parseValidatorRules({
      some_rule: { shortSummary: '', references: { fileReferences: [] } },
    });

    expect(rules.some_rule).toEqual({ summary: undefined, files: [] });
  });

  it('drops non-string file references rather than rendering them', () => {
    const rules = parseValidatorRules({
      some_rule: { references: { fileReferences: ['trips.txt', 42, null] } },
    });

    expect(rules.some_rule.files).toEqual(['trips.txt']);
  });

  it('tolerates a rule with no references block', () => {
    const rules = parseValidatorRules({ some_rule: { shortSummary: 'Hi.' } });

    expect(rules.some_rule).toEqual({ summary: 'Hi.', files: [] });
  });

  it('skips entries that are not objects', () => {
    const rules = parseValidatorRules({ some_rule: 'nope', other: 5 });

    expect(rules).toEqual({});
  });

  it('returns an empty index for a payload that is not an object', () => {
    expect(parseValidatorRules(null)).toEqual({});
    expect(parseValidatorRules('rules')).toEqual({});
    expect(parseValidatorRules(undefined)).toEqual({});
  });
});

describe('getValidatorRuleUrl', () => {
  it('points at the rule anchor on the validator rules page', () => {
    expect(getValidatorRuleUrl('missing_required_field')).toBe(
      'https://gtfs-validator.mobilitydata.org/rules.html#missing_required_field-rule',
    );
  });
});
