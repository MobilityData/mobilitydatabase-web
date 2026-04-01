/**
 * CSV parser for GTFS text files.
 * Handles standard CSV with quoted fields and newlines inside quotes.
 */

import { type GtfsRawRow } from './gtfs-types';

/**
 * Parse a CSV string into an array of row objects.
 * Keys are taken from the header row and trimmed of BOM / whitespace.
 */
export function parseCsv(text: string): GtfsRawRow[] {
  const lines = splitCsvLines(text);
  if (lines.length === 0) return [];

  // Parse header – strip BOM if present
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = parseCsvLine(headerLine).map((h) => h.trim());
  if (headers.length === 0) return [];

  const rows: GtfsRawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const values = parseCsvLine(line);
    const row: GtfsRawRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Split CSV text into logical lines, respecting quoted fields
 * that may contain newline characters.
 */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // skip \r\n
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

/**
 * Parse a single CSV line into field values.
 * Handles double-quoted fields and escaped quotes ("").
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Read a File as text using the browser FileReader API.
 */
export async function readFileAsText(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

/**
 * Parse multiple uploaded GTFS files into a map of filename → rows.
 */
export async function parseGtfsFiles(
  files: File[],
): Promise<Map<string, GtfsRawRow[]>> {
  const result = new Map<string, GtfsRawRow[]>();

  await Promise.all(
    files.map(async (file) => {
      const text = await readFileAsText(file);
      const rows = parseCsv(text);
      result.set(file.name.toLowerCase(), rows);
    }),
  );

  return result;
}
