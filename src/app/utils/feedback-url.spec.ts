import { buildFeedbackUrl, FEEDBACK_FORMS } from './feedback-url';

describe('buildFeedbackUrl', () => {
  it('returns the bare form URL when nothing is known about the user', () => {
    const url = buildFeedbackUrl('seal');

    expect(url).toContain('/viewform');
    expect(url).not.toContain('usp=pp_url');
    expect(url).not.toContain('entry.');
  });

  it.each(Object.keys(FEEDBACK_FORMS) as Array<keyof typeof FEEDBACK_FORMS>)(
    'points the %s form at its own unprefilled URL',
    (form) => {
      expect(buildFeedbackUrl(form)).toBe(FEEDBACK_FORMS[form]);
    },
  );

  it('keeps the seal and notifications forms distinct', () => {
    expect(buildFeedbackUrl('seal')).not.toBe(
      buildFeedbackUrl('notifications'),
    );
  });

  it('prefills both name and email when both are available', () => {
    const url = new URL(
      buildFeedbackUrl('notifications', {
        name: 'Ada Lovelace',
        email: 'ada@example.org',
      }),
    );

    expect(url.origin + url.pathname).toBe(FEEDBACK_FORMS.notifications);
    expect(url.searchParams.get('usp')).toBe('pp_url');
    expect(url.searchParams.get('entry.1481076408')).toBe('Ada Lovelace');
    expect(url.searchParams.get('entry.1610387831')).toBe('ada@example.org');
  });

  it('omits the fields it does not have', () => {
    const url = new URL(buildFeedbackUrl('seal', { email: 'ada@example.org' }));

    expect(url.searchParams.has('entry.1481076408')).toBe(false);
    expect(url.searchParams.get('entry.1610387831')).toBe('ada@example.org');
  });

  it('ignores blank and null values rather than prefilling empty fields', () => {
    const url = buildFeedbackUrl('seal', { name: '   ', email: null });

    expect(url).not.toContain('usp=pp_url');
    expect(url).not.toContain('entry.');
  });

  it('trims surrounding whitespace before prefilling', () => {
    const url = new URL(buildFeedbackUrl('seal', { name: '  Ada Lovelace  ' }));

    expect(url.searchParams.get('entry.1481076408')).toBe('Ada Lovelace');
  });
});
