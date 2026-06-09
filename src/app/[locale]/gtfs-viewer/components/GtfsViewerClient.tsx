'use client';

// Client Component wrapper that lazy-loads GtfsViewerClient with ssr:false.
// This keeps DuckDB-WASM out of the server bundle and prevents the Turbopack
// WASM chunking crash at build time. ssr:false is allowed here because this
// is a Client Component.
import dynamic from 'next/dynamic';

const GtfsViewerClient = dynamic(
  () => import('../../../components/gtfs-viewer/GtfsViewerClient'),
  { ssr: false },
);

export default GtfsViewerClient;
