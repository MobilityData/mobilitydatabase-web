'use client';

/**
 * GTFS Viewer POC
 *
 * Loads Parquet files from a public GCS bucket (or local http.server) using
 * DuckDB-WASM + HTTP Range requests. No backend required — all queries run
 * in the browser.
 *
 * Workflow:
 *   1. Paste a metadata.json URL  → pick a table from the sidebar
 *      OR paste a direct .parquet URL → view it immediately
 *   2. DuckDB fetches only the Parquet row groups that satisfy the search
 *      (same principle as PMTiles: index → byte-range fetch → render)
 *   3. Pagination + per-column search work without loading the full file
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TableMeta {
  file: string;
  row_count: number;
  size_bytes: number;
  columns: string[];
  sort_columns: string[];
}

interface GtfsMetadata {
  source: string;
  generated_at: string;
  row_group_size: number;
  tables: Record<string, TableMeta>;
}

type SortDir = 'asc' | 'desc';

interface GtfsViewerClientProps {
  /** Pre-set URL (metadata.json or .parquet). Hides the URL input when provided. */
  initialUrl?: string;
  /** When true, suppresses the page header and URL input — for embedding in feed pages. */
  embedded?: boolean;
}

// ─── DuckDB initialisation (singleton, loaded once) ─────────────────────────

let dbPromise: Promise<import('@duckdb/duckdb-wasm').AsyncDuckDB> | null = null;

async function getDuckDB(): Promise<import('@duckdb/duckdb-wasm').AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const duckdb = await import('@duckdb/duckdb-wasm');
      // Load WASM bundles from jsDelivr CDN — no webpack config needed
      const BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(BUNDLES);

      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
      );
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);
      return db;
    })();
  }
  return dbPromise;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtRows(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtBytes(b: number): string {
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)} MB`;
  if (b >= 1_000) return `${(b / 1_000).toFixed(0)} KB`;
  return `${b} B`;
}

function resolveParquetUrl(baseUrl: string, file: string): string {
  const base = baseUrl.replace(/\/metadata\.json$/, '');
  return `${base}/${file}`;
}

// Build a WHERE clause from search state
function buildWhere(
  columns: string[],
  searchTerm: string,
  searchColumn: string,
): string {
  if (!searchTerm.trim()) return '';
  const escaped = searchTerm.replace(/'/g, "''");
  if (searchColumn === '__all__') {
    const parts = columns.map((c) => `CAST("${c}" AS VARCHAR) ILIKE '%${escaped}%'`);
    return `WHERE (${parts.join(' OR ')})`;
  }
  return `WHERE CAST("${searchColumn}" AS VARCHAR) ILIKE '%${escaped}%'`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function GtfsViewerClient({
  initialUrl,
  embedded = false,
}: GtfsViewerClientProps): React.ReactElement {
  // ── URL / load state
  const [urlInput, setUrlInput] = useState(initialUrl ?? '');
  const [loadedUrl, setLoadedUrl] = useState('');
  const [metadata, setMetadata] = useState<GtfsMetadata | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [parquetUrl, setParquetUrl] = useState<string | null>(null);

  // ── DuckDB state
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const connRef = useRef<import('@duckdb/duckdb-wasm').AsyncDuckDBConnection | null>(null);

  // ── Query state
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchColumn, setSearchColumn] = useState('__all__');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryMs, setQueryMs] = useState<number | null>(null);

  // ── Initialise DuckDB on mount
  useEffect(() => {
    getDuckDB()
      .then(async (db) => {
        const conn = await db.connect();
        connRef.current = conn;
        setDbReady(true);
      })
      .catch((e) => setDbError(String(e)));
  }, []);

  // ── Auto-load when initialUrl is provided and DuckDB is ready
  useEffect(() => {
    if (dbReady && initialUrl && !loadedUrl) {
      setUrlInput(initialUrl);
      void handleLoad(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady, initialUrl]);

  // ── Run query whenever parquet URL or query params change
  const runQuery = useCallback(async () => {
    const conn = connRef.current;
    if (!conn || !parquetUrl) return;
    setQueryLoading(true);
    setQueryError(null);
    const t0 = performance.now();
    try {
      const where = buildWhere(columns, searchTerm, searchColumn);
      const orderClause =
        sortColumn ? `ORDER BY "${sortColumn}" ${sortDir.toUpperCase()}` : '';

      // 1. Get column names if we don't have them yet
      let cols = columns;
      if (cols.length === 0) {
        const schemaResult = await conn.query(
          `SELECT * FROM read_parquet('${parquetUrl}') LIMIT 0`,
        );
        cols = schemaResult.schema.fields.map((f) => f.name);
        setColumns(cols);
      }

      // 2. Count total rows (uses Parquet statistics — very fast)
      const countResult = await conn.query(
        `SELECT COUNT(*) as n FROM read_parquet('${parquetUrl}') ${buildWhere(cols, searchTerm, searchColumn)}`,
      );
      const total = Number(countResult.toArray()[0].n);
      setTotalRows(total);

      // 3. Fetch current page
      const dataResult = await conn.query(
        `SELECT * FROM read_parquet('${parquetUrl}')
         ${buildWhere(cols, searchTerm, searchColumn)}
         ${orderClause}
         LIMIT ${rowsPerPage} OFFSET ${page * rowsPerPage}`,
      );
      setRows(dataResult.toArray().map((r) => Object.fromEntries(
        dataResult.schema.fields.map((f, i) => [f.name, r[f.name] ?? null]),
      )));
      setQueryMs(Math.round(performance.now() - t0));
    } catch (e) {
      setQueryError(String(e));
    } finally {
      setQueryLoading(false);
    }
  }, [parquetUrl, columns, searchTerm, searchColumn, sortColumn, sortDir, page, rowsPerPage]);

  useEffect(() => {
    if (parquetUrl) runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parquetUrl, searchTerm, searchColumn, sortColumn, sortDir, page, rowsPerPage]);

  // ── Load URL (metadata.json or direct .parquet)
  const handleLoad = async (overrideUrl?: string): Promise<void> => {
    const url = (overrideUrl ?? urlInput).trim();
    if (!url) return;
    setQueryError(null);
    setMetadata(null);
    setSelectedTable(null);
    setColumns([]);
    setRows([]);
    setTotalRows(0);
    setPage(0);
    setSearchTerm('');
    setSortColumn(null);

    if (url.endsWith('.parquet') || url.includes('.parquet?')) {
      setLoadedUrl(url);
      setParquetUrl(url);
    } else {
      // Assume metadata.json
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const meta: GtfsMetadata = await res.json();
        setMetadata(meta);
        setLoadedUrl(url);
        // Auto-select first table
        const firstTable = Object.keys(meta.tables)[0];
        if (firstTable) {
          setSelectedTable(firstTable);
          setParquetUrl(resolveParquetUrl(url, meta.tables[firstTable].file));
        }
      } catch (e) {
        setQueryError(`Failed to load: ${String(e)}`);
      }
    }
  };

  const handleTableSelect = (tableName: string): void => {
    if (!metadata) return;
    setSelectedTable(tableName);
    setColumns([]);
    setRows([]);
    setTotalRows(0);
    setPage(0);
    setSearchTerm('');
    setSortColumn(null);
    setParquetUrl(resolveParquetUrl(loadedUrl, metadata.tables[tableName].file));
  };

  const handleSort = (col: string): void => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
    setPage(0);
  };

  const currentTableMeta = metadata && selectedTable ? metadata.tables[selectedTable] : null;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={embedded ? {} : { py: 3, maxWidth: 'xl', mx: 'auto' }}>
      {/* Header — hidden in embedded mode */}
      {!embedded && (
        <>
          <Stack direction='row' alignItems='center' spacing={1} mb={1}>
            <Typography variant='h5' fontWeight={700}>
              GTFS Viewer
            </Typography>
            <Chip label='POC' size='small' color='warning' variant='outlined' />
            <Tooltip title='Powered by DuckDB-WASM. Queries run entirely in your browser using HTTP Range requests — no backend needed.'>
              <InfoOutlinedIcon fontSize='small' color='action' sx={{ cursor: 'help' }} />
            </Tooltip>
          </Stack>
          <Typography variant='body2' color='text.secondary' mb={3}>
            Paste a <code>metadata.json</code> URL (from <code>gtfs-to-parquet.sh</code> output) or a
            direct <code>.parquet</code> URL. Files are queried via HTTP Range requests — only the
            rows you see are downloaded.
          </Typography>
        </>
      )}

      {/* DuckDB status */}
      {!dbReady && !dbError && (
        <Alert severity='info' icon={<CircularProgress size={16} />} sx={{ mb: 2 }}>
          Loading DuckDB-WASM engine (~6 MB, cached after first load)…
        </Alert>
      )}
      {dbError && (
        <Alert severity='error' sx={{ mb: 2 }}>
          DuckDB failed to initialise: {dbError}
        </Alert>
      )}

      {/* URL input — hidden in embedded mode (URL is pre-set) */}
      {!embedded && (
        <Paper variant='outlined' sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            fullWidth
            size='small'
            label='metadata.json or .parquet URL'
            placeholder='http://localhost:8888/metadata.json  or  https://storage.googleapis.com/…/stops.parquet'
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            disabled={!dbReady}
          />
          <Button
            variant='contained'
            onClick={() => { void handleLoad(); }}
            disabled={!dbReady || !urlInput.trim()}
            sx={{ whiteSpace: 'nowrap', minWidth: 100 }}
          >
            Load
          </Button>
        </Stack>
        {metadata && (
          <Typography variant='caption' color='text.secondary' mt={1} display='block'>
            Source: {metadata.source} · Generated: {new Date(metadata.generated_at).toLocaleString()}
          </Typography>
        )}
      </Paper>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems='flex-start'>
        {/* Table sidebar */}
        {metadata && (
          <Paper
            variant='outlined'
            sx={{ minWidth: 200, width: { xs: '100%', md: 220 }, flexShrink: 0 }}
          >
            <Typography variant='overline' sx={{ px: 2, pt: 1.5, display: 'block' }} color='text.secondary'>
              Tables
            </Typography>
            <Divider />
            {Object.entries(metadata.tables).map(([name, meta]) => (
              <Box
                key={name}
                onClick={() => handleTableSelect(name)}
                sx={{
                  px: 2,
                  py: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  bgcolor: selectedTable === name ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                  borderLeft: selectedTable === name ? '3px solid' : '3px solid transparent',
                  borderColor: selectedTable === name ? 'primary.main' : 'transparent',
                }}
              >
                <Typography variant='body2' fontWeight={selectedTable === name ? 600 : 400}>
                  {name}
                </Typography>
                <Chip
                  label={fmtRows(meta.row_count)}
                  size='small'
                  variant='outlined'
                  color={meta.row_count > 500_000 ? 'warning' : 'default'}
                  sx={{ fontSize: 10, height: 18 }}
                />
              </Box>
            ))}
          </Paper>
        )}

        {/* Main content */}
        <Box flex={1} minWidth={0}>
          {/* Toolbar */}
          {parquetUrl && (
            <Paper variant='outlined' sx={{ p: 1.5, mb: 1 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems='center'>
                {/* Global / column search */}
                <FormControl size='small' sx={{ minWidth: 140 }}>
                  <InputLabel>Search column</InputLabel>
                  <Select
                    value={searchColumn}
                    label='Search column'
                    onChange={(e) => { setSearchColumn(e.target.value); setPage(0); }}
                  >
                    <MenuItem value='__all__'>All columns</MenuItem>
                    {(currentTableMeta?.columns ?? columns).map((c) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  size='small'
                  placeholder='Search…'
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                  sx={{ flex: 1 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position='start'>
                        <SearchIcon fontSize='small' />
                      </InputAdornment>
                    ),
                    endAdornment: searchTerm && (
                      <InputAdornment position='end'>
                        <IconButton size='small' onClick={() => { setSearchTerm(''); setPage(0); }}>
                          <ClearIcon fontSize='small' />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                {/* Stats */}
                <Stack direction='row' spacing={1} alignItems='center' flexShrink={0}>
                  {queryMs !== null && (
                    <Chip
                      label={`${queryMs}ms`}
                      size='small'
                      color={queryMs < 500 ? 'success' : queryMs < 2000 ? 'warning' : 'error'}
                      variant='outlined'
                      title='Query latency (includes HTTP range requests)'
                    />
                  )}
                  {currentTableMeta && (
                    <Chip
                      label={fmtBytes(currentTableMeta.size_bytes)}
                      size='small'
                      variant='outlined'
                      title='Parquet file size (full file, only matching row groups are fetched)'
                    />
                  )}
                  <Tooltip title='Open Parquet URL in new tab'>
                    <IconButton size='small' href={parquetUrl} target='_blank' rel='noreferrer'>
                      <OpenInNewIcon fontSize='small' />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          )}

          {/* Error */}
          {queryError && (
            <Alert severity='error' sx={{ mb: 1 }} onClose={() => setQueryError(null)}>
              {queryError}
            </Alert>
          )}

          {/* Table */}
          {parquetUrl && (
            <Paper variant='outlined'>
              <TableContainer sx={{ maxHeight: 'calc(100vh - 380px)', overflowX: 'auto' }}>
                <Table stickyHeader size='small'>
                  <TableHead>
                    <TableRow>
                      {(queryLoading && columns.length === 0
                        ? (currentTableMeta?.columns ?? Array.from({ length: 6 }, (_, i) => `col_${i}`))
                        : columns
                      ).map((col) => (
                        <TableCell
                          key={col}
                          sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' }}
                        >
                          <TableSortLabel
                            active={sortColumn === col}
                            direction={sortColumn === col ? sortDir : 'asc'}
                            onClick={() => handleSort(col)}
                          >
                            {col}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queryLoading
                      ? Array.from({ length: Math.min(rowsPerPage, 10) }).map((_, i) => (
                          <TableRow key={i}>
                            {(columns.length > 0 ? columns : Array.from({ length: 6 })).map((_, j) => (
                              <TableCell key={j}>
                                <Skeleton variant='text' width={`${60 + Math.random() * 40}%`} />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      : rows.map((row, i) => (
                          <TableRow key={i} hover>
                            {columns.map((col) => (
                              <TableCell
                                key={col}
                                sx={{
                                  maxWidth: 300,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                }}
                                title={String(row[col] ?? '')}
                              >
                                {String(row[col] ?? '')}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component='div'
                count={totalRows}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                rowsPerPageOptions={[25, 50, 100, 250]}
                labelDisplayedRows={({ from, to, count }) =>
                  `${from}–${to} of ${fmtRows(count)} rows`
                }
              />
            </Paper>
          )}

          {/* Empty state */}
          {!parquetUrl && dbReady && (
            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: embedded ? 3 : 6,
                textAlign: 'center',
                color: 'text.secondary',
              }}
            >
              {embedded ? (
                <Typography variant='body2'>
                  Parquet data not yet available for this dataset. Run{' '}
                  <code>gtfs-to-parquet.sh</code> to generate it.
                </Typography>
              ) : (
                <>
                  <Typography variant='h6' gutterBottom>
                    No file loaded
                  </Typography>
                  <Typography variant='body2'>
                    Generate Parquet files locally:
                  </Typography>
                  <Box
                    component='pre'
                    sx={{
                      mt: 1,
                      p: 1.5,
                      bgcolor: 'grey.100',
                      borderRadius: 1,
                      fontSize: 12,
                      textAlign: 'left',
                      display: 'inline-block',
                    }}
                  >
                    {`# In mobility-feed-api repo:\n./scripts/gtfs-to-parquet.sh --url "https://storage.googleapis.com/mdb-latest/mdb-10.zip"\n\n# Then serve locally:\ncd ./gtfs_parquet_output && python3 -m http.server 8888\n\n# Paste in the field above:\nhttp://localhost:8888/metadata.json`}
                  </Box>
                </>
              )}
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
