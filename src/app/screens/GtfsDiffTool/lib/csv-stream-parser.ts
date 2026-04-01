/**
 * Streaming CSV parser for large GTFS files — columnar output.
 *
 * Parses CSV data incrementally from either a File (via File.stream())
 * or a Uint8Array (from ZIP decompression). Outputs ColumnarTable
 * instead of row objects — dramatically reducing memory for large files.
 *
 * String interning deduplicates repeated values (stop_ids, route_ids, etc.)
 * which further cuts memory by 40-60% for typical GTFS data.
 */

import { ColumnarTable, StringPool } from './columnar-table';

// ── Core line parser ───────────────────────────────────────────────

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

// ── Columnar stream parser ─────────────────────────────────────────

/**
 * Incremental CSV parser that stores data column-wise.
 * Instead of emitting row objects, it appends values to column arrays.
 */
export class ColumnarStreamParser {
  private headers: string[] | null = null;
  private columns: string[][] = [];
  private buffer = '';
  private inQuotes = false;
  private firstChunk = true;
  private pool: StringPool;
  private _rowCount = 0;

  constructor(pool?: StringPool) {
    this.pool = pool ?? new StringPool();
  }

  get rowCount(): number {
    return this._rowCount;
  }

  /** Feed a chunk of text. May parse zero or more rows. */
  push(chunk: string): void {
    // Strip BOM from very first chunk
    if (this.firstChunk) {
      chunk = chunk.replace(/^\uFEFF/, '');
      this.firstChunk = false;
    }

    this.buffer += chunk;
    this.drainLines();
  }

  /** Signal end-of-input. Flushes any remaining buffered line. */
  flush(): void {
    if (this.buffer.length > 0) {
      this.processLine(this.buffer);
      this.buffer = '';
    }
  }

  /** Build the final ColumnarTable. Call after flush(). */
  toTable(): ColumnarTable {
    return new ColumnarTable(this.headers ?? [], this.columns);
  }

  // ── internals ────────────────────────────────────────────────────

  private drainLines(): void {
    let searchFrom = 0;
    while (searchFrom < this.buffer.length) {
      const ch = this.buffer[searchFrom];

      if (ch === '"') {
        this.inQuotes = !this.inQuotes;
        searchFrom++;
        continue;
      }

      if (this.inQuotes) {
        searchFrom++;
        continue;
      }

      if (ch === '\n' || ch === '\r') {
        const line = this.buffer.substring(0, searchFrom);
        // Advance past \r\n pair
        if (ch === '\r' && this.buffer[searchFrom + 1] === '\n') {
          this.buffer = this.buffer.substring(searchFrom + 2);
        } else {
          this.buffer = this.buffer.substring(searchFrom + 1);
        }
        searchFrom = 0;
        this.processLine(line);
        continue;
      }

      searchFrom++;
    }
  }

  private processLine(line: string): void {
    if (line.trim() === '') return;

    const fields = parseCsvLine(line);

    if (this.headers === null) {
      this.headers = fields.map((h) => h.trim());
      // Initialise one empty array per column
      this.columns = this.headers.map(() => []);
      return;
    }

    // Append values to column arrays, with interning
    for (let c = 0; c < this.columns.length; c++) {
      const raw = fields[c] ?? '';
      this.columns[c].push(this.pool.intern(raw));
    }
    this._rowCount++;
  }
}

// ── High-level helpers ─────────────────────────────────────────────

/**
 * Parse a File into a ColumnarTable using the streaming ReadableStream API.
 * Does NOT hold the full file text in memory.
 */
export async function parseFileToColumnar(
  file: File,
  pool?: StringPool,
): Promise<ColumnarTable> {
  const parser = new ColumnarStreamParser(pool);
  const stream = file.stream();
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(value);
  }
  parser.flush();
  return parser.toTable();
}

/**
 * Parse a Uint8Array (e.g. from ZIP decompression) into a ColumnarTable.
 * Decodes in 512 KB chunks to avoid creating one giant string.
 */
export function parseUint8ArrayToColumnar(
  data: Uint8Array,
  pool?: StringPool,
): ColumnarTable {
  const parser = new ColumnarStreamParser(pool);
  const decoder = new TextDecoder('utf-8');

  const CHUNK = 512 * 1024; // 512 KB
  let offset = 0;
  while (offset < data.length) {
    const end = Math.min(offset + CHUNK, data.length);
    const slice = data.subarray(offset, end);
    parser.push(decoder.decode(slice, { stream: end < data.length }));
    offset = end;
  }
  parser.flush();
  return parser.toTable();
}
