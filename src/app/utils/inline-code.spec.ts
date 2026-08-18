import { tokenizeInlineCode } from './inline-code';

describe('tokenizeInlineCode', () => {
  it('returns a single plain token when there is no code', () => {
    expect(tokenizeInlineCode('No code here')).toEqual([
      { text: 'No code here', isCode: false },
    ]);
  });

  it('splits a code run out of the surrounding text', () => {
    expect(tokenizeInlineCode('Uses `feed_info.txt` daily')).toEqual([
      { text: 'Uses ', isCode: false },
      { text: 'feed_info.txt', isCode: true },
      { text: ' daily', isCode: false },
    ]);
  });

  it('handles several code runs, including at the start', () => {
    expect(
      tokenizeInlineCode('`calendar.txt` and `calendar_dates.txt`'),
    ).toEqual([
      { text: 'calendar.txt', isCode: true },
      { text: ' and ', isCode: false },
      { text: 'calendar_dates.txt', isCode: true },
    ]);
  });

  it('leaves an unmatched backtick as plain text', () => {
    expect(tokenizeInlineCode('an `unclosed run')).toEqual([
      { text: 'an `unclosed run', isCode: false },
    ]);
  });

  it('returns no tokens for an empty string', () => {
    expect(tokenizeInlineCode('')).toEqual([]);
  });
});
