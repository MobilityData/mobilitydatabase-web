/* eslint-disable */
import type { ReactElement } from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import InfoIcon from '@mui/icons-material/Info';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import RemoveIcon from '@mui/icons-material/Remove';
import type {
  Feature,
  Consumer,
  MdLinkToken,
  UrlToken,
  FileToken,
  FieldToken,
  Token,
} from './types';

// Many of these helper functions are based on parsing freeform text from the CSV, so they include some normalization and best-effort handling of unexpected values
// Once the data will come from the database with a well-defined schema, some of these parsing/normalization functions can be simplified or removed

export function getStatusText(raw: string): string {
  const n = raw.toLowerCase().trim();
  if (n.startsWith('yes - for every feed')) return 'Every feed';
  if (n.startsWith('yes - for some feeds')) return 'Some feeds';
  if (n.startsWith('yes')) return 'Yes';
  if (n.startsWith('no')) return 'No';
  if (n === 'integration planned') return 'Planned';
  if (n === 'test in progress') return 'Test in progress';
  if (n === 'partial integration') return 'Partial integration';
  if (n === 'some fields are ignored') return 'Some fields ignored';
  return raw || 'Unknown';
}

export function getStatusIcon(raw: string): ReactElement {
  const n = raw.toLowerCase().trim();
  if (n.startsWith('yes'))
    return <CheckCircleIcon color='success' sx={{ fontSize: 20 }} />;
  if (n.startsWith('no'))
    return <CancelIcon color='error' sx={{ fontSize: 20 }} />;
  if (n === 'integration planned')
    return <InfoIcon color='info' sx={{ fontSize: 20 }} />;
  if (n === 'test in progress')
    return <AutorenewIcon color='warning' sx={{ fontSize: 20 }} />;
  if (n === 'partial integration')
    return <InfoIcon color='warning' sx={{ fontSize: 20 }} />;
  if (n === 'some fields are ignored')
    return <InfoIcon color='info' sx={{ fontSize: 20 }} />;
  return <RemoveIcon sx={{ fontSize: 20, color: 'text.disabled' }} />;
}

export function isStatusSupported(raw: string): boolean {
  return raw.toLowerCase().trim().startsWith('yes');
}

export function computeCategoryProgress(
  features: Feature[],
  consumers: Consumer[],
): number {
  let supported = 0;
  let total = 0;
  for (const feature of features) {
    for (const consumer of consumers) {
      const raw = feature.support[consumer.id]?.rawStatus ?? '';
      if (raw) {
        total++;
        if (isStatusSupported(raw)) supported++;
      }
    }
  }
  return total > 0 ? Math.round((supported / total) * 100) : 0;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function tokenizeDetail(
  text: string,
  knownFieldsSet: Set<string>,
): Token[] {
  if (!text) return [];
  const tokens: Array<MdLinkToken | UrlToken | FileToken | FieldToken> = [];

  // 1. Markdown links [label](url)
  const mdRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text)) !== null) {
    tokens.push({
      type: 'mdlink',
      label: m[1],
      url: m[2],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // 2. Bare URLs
  const urlRe = /https?:\/\/[^\s,)]+/g;
  while ((m = urlRe.exec(text)) !== null) {
    const overlaps = tokens.some(
      (t) => m!.index >= t.start && m!.index < t.end,
    );
    if (!overlaps)
      tokens.push({
        type: 'url',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
  }

  // 3. .txt file names
  const fileRe = /\b[a-z_]+\.txt\b/g;
  while ((m = fileRe.exec(text)) !== null) {
    const overlaps = tokens.some(
      (t) => m!.index >= t.start && m!.index < t.end,
    );
    if (!overlaps)
      tokens.push({
        type: 'file',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
  }

  // 4. Known GTFS field names
  const fieldRe = /\b[a-z][a-z0-9_]*[a-z0-9]\b|\b[a-z]{2,}\b/g;
  while ((m = fieldRe.exec(text)) !== null) {
    if (!knownFieldsSet.has(m[0])) continue;
    const overlaps = tokens.some(
      (t) => m!.index >= t.start && m!.index < t.end,
    );
    if (!overlaps)
      tokens.push({
        type: 'field',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
  }

  tokens.sort((a, b) => a.start - b.start);

  const segments: Token[] = [];
  let cursor = 0;
  for (const tok of tokens) {
    if (tok.start > cursor)
      segments.push({ type: 'text', value: text.slice(cursor, tok.start) });
    segments.push(tok);
    cursor = tok.end;
  }
  if (cursor < text.length)
    segments.push({ type: 'text', value: text.slice(cursor) });
  return segments;
}
