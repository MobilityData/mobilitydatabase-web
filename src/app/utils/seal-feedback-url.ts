/**
 * It's a redirect to a google form
 */
const SEAL_FEEDBACK_FORM_URL =
  'https://share.mobilitydata.org/sealfeedback';

/**
 * Field ids taken from the form's own "Get pre-filled link" output. They are
 * stable for the life of a question, but deleting and re-adding the "Name" or
 * "Email" question in the form mints a new id and silently stops the prefill -
 * regenerate them from the form if prefilled values stop showing up.
 */
const NAME_ENTRY_ID = 'entry.1481076408';
const EMAIL_ENTRY_ID = 'entry.1610387831';

/** The form with nothing prefilled - what the server renders. */
export const SEAL_FEEDBACK_URL = SEAL_FEEDBACK_FORM_URL;

export interface SealFeedbackPrefill {
  name?: string | null;
  email?: string | null;
}

/**
 * Builds the feedback form URL, prefilling the respondent's name and email
 * when the app knows them. Blank or missing values are left out entirely so
 * the form renders an empty field rather than an empty prefill.
 */
export function buildSealFeedbackUrl(
  prefill: SealFeedbackPrefill = {},
): string {
  const url = new URL(SEAL_FEEDBACK_FORM_URL);
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
