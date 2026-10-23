import { open, readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { diffFilePath } from '../../../../../lib/gtfs-diff-datasets';
import { parseRange } from '../../../../screens/GtfsDiffToolV2/lib/http-range';

/**
 * Serves the files of a generated diff: /api/gtfs-diff-v2/<id>/<path>, the
 * same layout and behaviour as the object storage the backend will write to
 * (see lib/datasets.ts), so the client can point at either through
 * NEXT_PUBLIC_GTFS_DIFF_BASE_URL.
 *
 * Only files listed in the diff's manifest.json are served. HEAD and single
 * `Range: bytes=…` requests are answered like S3 does, which is how
 * DuckDB-WASM reads Parquet files without downloading them whole. Whole
 * JSON files go out gzip-compressed when the client accepts it, as a CDN
 * in front of the bucket would (IDFM's detail files: 50 MB -> 10 MB).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  parquet: 'application/vnd.apache.parquet',
};

interface RouteContext {
  params: Promise<{ dataset: string; path: string[] }>;
}

const gzipAsync = promisify(gzip);

/** Compressed JSON files, by path and mtime; a few, they can be large. */
const GZIP_CACHE_MAX = 6;
const gzipCache = new Map<string, Promise<Buffer>>();

function gzipped(file: string, mtimeMs: number): Promise<Buffer> {
  const key = `${file}|${mtimeMs}`;
  let hit = gzipCache.get(key);
  if (hit == null) {
    hit = readFile(file).then((b) => gzipAsync(b));
    hit.catch(() => gzipCache.delete(key));
    gzipCache.set(key, hit);
    while (gzipCache.size > GZIP_CACHE_MAX) {
      const oldest = gzipCache.keys().next().value;
      if (oldest == null) break;
      gzipCache.delete(oldest);
    }
  }
  return hit;
}

async function resolveFile(context: RouteContext): Promise<{
  file: string;
  size: number;
  type: string;
  mtimeMs: number;
} | null> {
  const { dataset, path } = await context.params;
  const file = diffFilePath(dataset, path.join('/'));
  if (file == null) return null;
  try {
    const s = await stat(file);
    const ext = file.slice(file.lastIndexOf('.') + 1);
    return s.isFile()
      ? {
          file,
          size: s.size,
          type: CONTENT_TYPES[ext] ?? 'application/octet-stream',
          mtimeMs: s.mtimeMs,
        }
      : null;
  } catch {
    return null;
  }
}

function headers(size: number, type: string): Record<string, string> {
  return {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(size),
    // Rebuilding a diff rewrites its files in place.
    'Cache-Control': 'no-cache',
  };
}

export async function HEAD(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const f = await resolveFile(context);
  if (f == null) return new Response(null, { status: 404 });
  // Like S3: a ranged HEAD answers 206 with the range's length. DuckDB-WASM
  // (reliableHeadRequests) sends `Range: bytes=0-` to check range support.
  const range = parseRange(request.headers.get('range'), f.size);
  if (range === 'invalid')
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${f.size}` },
    });
  if (range == null)
    return new Response(null, {
      status: 200,
      headers: headers(f.size, f.type),
    });
  const [start, end] = range;
  return new Response(null, {
    status: 206,
    headers: {
      ...headers(end - start + 1, f.type),
      'Content-Range': `bytes ${start}-${end}/${f.size}`,
    },
  });
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const f = await resolveFile(context);
  if (f == null) return new Response('Not found', { status: 404 });
  const range = parseRange(request.headers.get('range'), f.size);
  if (range === 'invalid')
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${f.size}` },
    });
  const gzipOk = /\bgzip\b/.test(request.headers.get('accept-encoding') ?? '');
  if (range == null && gzipOk && f.type === CONTENT_TYPES.json) {
    const body = await gzipped(f.file, f.mtimeMs);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': f.type,
        'Content-Encoding': 'gzip',
        'Content-Length': String(body.length),
        Vary: 'Accept-Encoding',
        'Cache-Control': 'no-cache',
      },
    });
  }
  const [start, end] = range ?? [0, f.size - 1];
  const length = end - start + 1;
  const handle = await open(f.file, 'r');
  try {
    const buf = new Uint8Array(length);
    await handle.read(buf, 0, length, start);
    return new Response(buf, {
      status: range ? 206 : 200,
      headers: {
        ...headers(length, f.type),
        ...(range
          ? { 'Content-Range': `bytes ${start}-${end}/${f.size}` }
          : {}),
      },
    });
  } finally {
    await handle.close();
  }
}
