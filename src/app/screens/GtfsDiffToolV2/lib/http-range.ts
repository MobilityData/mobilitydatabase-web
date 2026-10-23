/**
 * Single-range HTTP `Range` header parsing, for the raw Parquet route
 * (DuckDB-WASM asks for one byte range per request).
 */

/**
 * "bytes=a-b", "bytes=a-" or "bytes=-n" -> [start, end] (inclusive);
 * null when there is no header; 'invalid' when it can't be satisfied.
 */
export function parseRange(
  header: string | null,
  size: number,
): [number, number] | null | 'invalid' {
  if (header == null) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (m == null || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    // Suffix range: the last n bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? 'invalid' : [start, end];
}
