import { buildSealFeedbackUrl, SEAL_FEEDBACK_URL } from './seal-feedback-url';

describe('buildSealFeedbackUrl', () => {
  it('returns the bare form URL when nothing is known about the user', () => {
    const url = buildSealFeedbackUrl();

    expect(url).toBe('https://share.mobilitydata.org/sealfeedback');
    expect(url).not.toContain('usp=pp_url');
    expect(url).not.toContain('entry.');
  });

  it('exposes the same bare URL the server renders before hydration', () => {
    expect(SEAL_FEEDBACK_URL).toBe(buildSealFeedbackUrl());
  });

  it('prefills both name and email when both are available', () => {
    const url = new URL(
      buildSealFeedbackUrl({
        name: 'Ada Lovelace',
        email: 'ada@example.org',
      }),
    );

    expect(url.searchParams.get('usp')).toBe('pp_url');
    expect(url.searchParams.get('entry.1481076408')).toBe('Ada Lovelace');
    expect(url.searchParams.get('entry.1610387831')).toBe('ada@example.org');
  });

  it('omits the fields it does not have', () => {
    const url = new URL(buildSealFeedbackUrl({ email: 'ada@example.org' }));

    expect(url.searchParams.has('entry.1481076408')).toBe(false);
    expect(url.searchParams.get('entry.1610387831')).toBe('ada@example.org');
  });

  it('ignores blank and null values rather than prefilling empty fields', () => {
    const url = buildSealFeedbackUrl({ name: '   ', email: null });

    expect(url).not.toContain('usp=pp_url');
    expect(url).not.toContain('entry.');
  });

  it('trims surrounding whitespace before prefilling', () => {
    const url = new URL(buildSealFeedbackUrl({ name: '  Ada Lovelace  ' }));

    expect(url.searchParams.get('entry.1481076408')).toBe('Ada Lovelace');
  });
});
