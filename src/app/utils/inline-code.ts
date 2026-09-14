/**
 * Splits a string into plain and code runs on backtick delimiters.
 *
 * Translated copy often references identifiers such as `feed_info.txt`.
 * Translators write them wrapped in backticks so no markup leaks into the
 * messages files; render the result with the `RichText` component.
 */

const INLINE_CODE_PATTERN = /`([^`]+)`/g;

export interface InlineCodeToken {
  text: string;
  isCode: boolean;
}

export function tokenizeInlineCode(value: string): InlineCodeToken[] {
  const tokens: InlineCodeToken[] = [];
  let lastIndex = 0;

  // `matchAll` clones the regex internally, so hoisting the global pattern is
  // safe here.
  for (const match of value.matchAll(INLINE_CODE_PATTERN)) {
    const index = match.index;
    if (index > lastIndex) {
      tokens.push({ text: value.slice(lastIndex, index), isCode: false });
    }
    tokens.push({ text: match[1], isCode: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < value.length) {
    tokens.push({ text: value.slice(lastIndex), isCode: false });
  }

  return tokens;
}
