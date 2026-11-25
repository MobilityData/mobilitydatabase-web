/**
 * Google Forms collecting feedback on features in early release.
 *
 * Each entry is the canonical `viewform` URL rather than its `forms.gle` short
 * link: prefill parameters only survive on the long form, the short link drops
 * the query string when it redirects.
 */
export const FEEDBACK_FORMS = {
  seal: 'https://docs.google.com/forms/d/e/1FAIpQLSdKlJEdxA8Jz8g6Z04h3PsWbQ9qPsjp93qONrWvQR60xJT3-Q/viewform',
  notifications:
    'https://docs.google.com/forms/d/e/1FAIpQLSdOLZYv7707SmS3DWL_wIX3L0Zodoc38XN0qyv-xKJ3B5XjuA/viewform',
} as const;

export type FeedbackFormId = keyof typeof FEEDBACK_FORMS;

/**
 * Field ids taken from each form's own "Get pre-filled link" output. Every
 * form above shares them because they were copied from the same template.
 * They are stable for the life of a question, but deleting and re-adding the
 * "Name" or "Email" question in a form mints a new id and silently stops the
 * prefill - regenerate them from the form if prefilled values stop showing up,
 * and give that form its own ids if they diverge.
 */
const NAME_ENTRY_ID = 'entry.1481076408';
const EMAIL_ENTRY_ID = 'entry.1610387831';

export interface FeedbackPrefill {
  name?: string | null;
  email?: string | null;
}

/**
 * Builds the feedback form URL, prefilling the respondent's name and email
 * when the app knows them. Blank or missing values are left out entirely so
 * the form renders an empty field rather than an empty prefill. With no
 * prefill this is the bare form URL - what the server renders.
 */
export function buildFeedbackUrl(
  form: FeedbackFormId,
  prefill: FeedbackPrefill = {},
): string {
  const url = new URL(FEEDBACK_FORMS[form]);
  const name = prefill.name?.trim() ?? '';
  const email = prefill.email?.trim() ?? '';

  if (name === '' && email === '') {
    return url.toString();
  }

  // Google's own marker for a prefilled link; without it the form ignores the
  // entry parameters.
  url.searchParams.set('usp', 'pp_url');

  if (name !== '') {
    url.searchParams.set(NAME_ENTRY_ID, name);
  }
  if (email !== '') {
    url.searchParams.set(EMAIL_ENTRY_ID, email);
  }

  return url.toString();
}
