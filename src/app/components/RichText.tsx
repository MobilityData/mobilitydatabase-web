import { Fragment, type ReactElement } from 'react';
import { tokenizeInlineCode } from '../utils/inline-code';
import InlineCode from './InlineCode';

/**
 * Renders a translated string, turning `backtick` runs into inline code.
 *
 * Lets a messages file mark up identifiers without embedding HTML, e.g.
 * "the `feed_info.txt` file".
 */
export default function RichText({ text }: { text: string }): ReactElement {
  return (
    <>
      {tokenizeInlineCode(text).map((token, index) =>
        token.isCode ? (
          <InlineCode key={`${index}-${token.text}`}>{token.text}</InlineCode>
        ) : (
          <Fragment key={`${index}-${token.text}`}>{token.text}</Fragment>
        ),
      )}
    </>
  );
}
