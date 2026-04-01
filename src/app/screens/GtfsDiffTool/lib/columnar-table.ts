/**
 * Columnar table storage for large GTFS CSV files.
 *
 * Instead of storing one object per row (which creates millions of
 * JS objects for files like stop_times.txt), data is stored column-wise:
 * one string array per column. This reduces object overhead by 100x+
 * and enables string interning across the column.
 *
 * Row objects are reconstructed on demand via getRow().
 */

import { type GtfsRawRow } from './gtfs-types';

/**
 * Simple string pool that deduplicates identical string values.
 * For GTFS data, columns like stop_id and route_id repeat heavily —
 * interning avoids allocating thousands of identical strings.
 */
export class StringPool {
  private pool = new Map<string, string>();

  intern(s: string): string {
    const existing = this.pool.get(s);
    if (existing !== undefined) return existing;
    this.pool.set(s, s);
    return s;
  }

  get size(): number {
    return this.pool.size;
  }

  /** Release the index Map. Interned strings remain alive via column refs. */
  clear(): void {
    this.pool.clear();
  }
}

/**
 * Column-oriented table for GTFS CSV data.
 *
 * Memory layout:
 *   headers:  ["trip_id", "stop_id", "stop_sequence", ...]
 *   columns:  [
 *     ["T1","T1","T1","T2","T2",...],   // trip_id column
 *     ["S5","S8","S3","S5","S9",...],   // stop_id column
 *     ["1", "2", "3", "1", "2",...],    // stop_sequence column
 *     ...
 *   ]
 *
 * For 3M rows × 9 columns:
 *   Row-based: 3M objects + 27M properties → ~300MB overhead
 *   Columnar:  9 arrays → ~216 bytes overhead + same string data
 */
export class ColumnarTable {
  readonly headers: string[];
  readonly rowCount: number;
  private columns: string[][]; // columns[colIndex][rowIndex]
  private headerIndex: Map<string, number>;

  constructor(headers: string[], columns: string[][]) {
    this.headers = headers;
    this.columns = columns;
    this.rowCount = columns.length > 0 ? columns[0].length : 0;
    this.headerIndex = new Map<string, number>();
    for (let i = 0; i < headers.length; i++) {
      this.headerIndex.set(headers[i], i);
    }
  }

  /** Reconstruct a single row object on demand. */
  getRow(index: number): GtfsRawRow {
    const row: GtfsRawRow = {};
    for (let c = 0; c < this.headers.length; c++) {
      row[this.headers[c]] = this.columns[c][index];
    }
    return row;
  }

  /** Get the raw array for a named column (no copy). */
  getColumn(name: string): string[] | undefined {
    const idx = this.headerIndex.get(name);
    return idx !== undefined ? this.columns[idx] : undefined;
  }

  /** Get a single cell value without creating a row object. */
  getValue(columnName: string, rowIndex: number): string {
    const col = this.getColumn(columnName);
    return col ? col[rowIndex] : '';
  }

  /** Check whether a column exists. */
  hasColumn(name: string): boolean {
    return this.headerIndex.has(name);
  }

  /**
   * Build an index mapping column values → row indices.
   * For a stop_times.txt trip_id column with 3M rows and 100K unique trips,
   * this creates a Map with 100K entries pointing to arrays of indices.
   */
  buildIndex(columnName: string): Map<string, number[]> {
    const col = this.getColumn(columnName);
    if (!col) return new Map<string, number[]>();
    const index = new Map<string, number[]>();
    for (let i = 0; i < col.length; i++) {
      const key = col[i];
      const bucket = index.get(key);
      if (bucket) {
        bucket.push(i);
      } else {
        index.set(key, [i]);
      }
    }
    return index;
  }

  /**
   * Build a composite key index for multi-column keys.
   * E.g., for stop_times.txt: buildCompositeIndex(['trip_id', 'stop_sequence'])
   */
  buildCompositeIndex(columnNames: string[]): Map<string, number[]> {
    const cols = columnNames.map((name) => this.getColumn(name));
    if (cols.some((c) => c === undefined)) return new Map<string, number[]>();
    const validCols = cols as string[][];
    const index = new Map<string, number[]>();
    for (let i = 0; i < this.rowCount; i++) {
      let key = validCols[0][i];
      for (let c = 1; c < validCols.length; c++) {
        key += '|' + validCols[c][i];
      }
      const bucket = index.get(key);
      if (bucket) {
        bucket.push(i);
      } else {
        index.set(key, [i]);
      }
    }
    return index;
  }

  /**
   * Get column values for a set of row indices.
   * Avoids creating full row objects when you only need one column.
   */
  getValuesAtIndices(columnName: string, indices: number[]): string[] {
    const col = this.getColumn(columnName);
    if (!col) return [];
    const result = new Array<string>(indices.length);
    for (let i = 0; i < indices.length; i++) {
      result[i] = col[indices[i]];
    }
    return result;
  }

  /**
   * Get multiple rows at specific indices.
   * Use sparingly — only when row objects are actually needed (e.g., for display).
   */
  getRows(indices: number[]): GtfsRawRow[] {
    const result = new Array<GtfsRawRow>(indices.length);
    for (let i = 0; i < indices.length; i++) {
      result[i] = this.getRow(indices[i]);
    }
    return result;
  }

  /** Serialise to a transferable format for postMessage. */
  toTransferable(): { headers: string[]; columns: string[][] } {
    return { headers: this.headers, columns: this.columns };
  }

  /** Reconstruct from a transferred object. */
  static fromTransferable(data: {
    headers: string[];
    columns: string[][];
  }): ColumnarTable {
    return new ColumnarTable(data.headers, data.columns);
  }
}
