'use client';

import { useEffect, useRef, useState } from 'react';
import { parquetView, queryObjects } from './duckdb-client';
import type { DiffType, EntityChange } from './entity-diff-types';

/**
 * A page of a long entity change list stored as Parquet (written by
 * scripts/lib/raw-diff-parquet.mjs writeChangesTable): rows (ord, key,
 * status, label, context, field_changes, children), the last three as JSON.
 */

export function entityChangesQueries(
  view: string,
  status: DiffType | null,
  offset: number,
  limit: number,
): { page: string; count: string; params: string[] } {
  if (!/^[A-Za-z0-9_]+$/.test(view)) throw new Error(`Bad view: ${view}`);
  const where = status ? 'WHERE status = ?' : '';
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.max(1, Math.min(500, Math.floor(limit)));
  return {
    page: `SELECT * FROM "${view}" ${where} ORDER BY ord LIMIT ${lim} OFFSET ${off}`,
    count: `SELECT count(*)::INTEGER AS n FROM "${view}" ${where}`,
    params: status ? [status] : [],
  };
}

export function toEntityChange(r: Record<string, unknown>): EntityChange {
  const json = <T>(v: unknown): T | undefined =>
    typeof v === 'string' ? (JSON.parse(v) as T) : undefined;
  return {
    key: String(r.key),
    status: String(r.status) as EntityChange['status'],
    label: typeof r.label === 'string' ? r.label : undefined,
    context: json(r.context),
    field_changes: json(r.field_changes),
    children: json(r.children),
  };
}

export interface EntityChangesPage {
  rows: EntityChange[];
  total: number;
  loading: boolean;
  error: Error | null;
}

/** One page of the change list at `url`; keeps the previous page while loading. */
export function useEntityChanges(
  url: string | undefined,
  status: DiffType | null,
  offset: number,
  limit: number,
): EntityChangesPage {
  const [state, setState] = useState<Omit<EntityChangesPage, 'loading'>>({
    rows: [],
    total: 0,
    error: null,
  });
  const [loading, setLoading] = useState(url != null);
  const request = useRef(0);

  useEffect(() => {
    if (url == null) return;
    const id = ++request.current;
    setLoading(true);
    parquetView(url)
      .then(async (view) => {
        const q = entityChangesQueries(view, status, offset, limit);
        const rows = await queryObjects(q.page, q.params);
        const [{ n }] = await queryObjects(q.count, q.params);
        if (id !== request.current) return;
        setState({
          rows: rows.map(toEntityChange),
          total: Number(n),
          error: null,
        });
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (id !== request.current) return;
        setState((s) => ({
          ...s,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
        setLoading(false);
      });
  }, [url, status, offset, limit]);

  return { ...state, loading };
}
