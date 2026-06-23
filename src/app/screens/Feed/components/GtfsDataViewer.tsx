'use client';

/**
 * GtfsDataViewer
 *
 * Embeds the GTFS table viewer inside the feed detail page as a lazy-loaded
 * accordion. DuckDB-WASM is only downloaded when the user intentionally
 * expands the section — never on initial page load.
 *
 * The Parquet metadata URL is derived from the dataset's hosted_url using
 * the convention established by gtfs-to-parquet.sh:
 *   https://files.mobilitydatabase.org/{feed}/{dataset}/{dataset}.zip
 *   → https://files.mobilitydatabase.org/{feed}/{dataset}/gtfs_parquet/metadata.json
 */

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// next/dynamic with ssr:false prevents Turbopack from statically analysing
// the DuckDB-WASM package at build time (avoids the Turbopack WASM crash).
// The component is only loaded client-side when the accordion is expanded.
const GtfsViewerClient = dynamic(
  () => import('../../../components/gtfs-viewer/GtfsViewerClient'),
  {
    ssr: false,
    loading: () => (
      <Box sx={{ p: 3 }}>
        <Stack direction='row' spacing={1} alignItems='center' mb={2}>
          <CircularProgress size={16} />
          <Typography variant='body2' color='text.secondary'>
            Loading DuckDB-WASM engine…
          </Typography>
        </Stack>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant='rectangular' height={36} sx={{ mb: 0.5, borderRadius: 1 }} />
        ))}
      </Box>
    ),
  },
);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derives the Parquet metadata.json URL from a dataset's hosted ZIP URL.
 * Convention: replace the .zip filename with gtfs_parquet/metadata.json
 *
 * Input:  https://files.mobilitydatabase.org/mdb-2014/mdb-2014-20250708/mdb-2014-20250708.zip
 * Output: https://files.mobilitydatabase.org/mdb-2014/mdb-2014-20250708/gtfs_parquet/metadata.json
 */
function deriveParquetMetaUrl(hostedUrl: string): string {
  const lastSlash = hostedUrl.lastIndexOf('/');
  const base = hostedUrl.substring(0, lastSlash);
  return `${base}/gtfs_parquet/metadata.json`;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface GtfsDataViewerProps {
  /** The dataset's hosted ZIP URL (from latestDataset.hosted_url) */
  hostedUrl: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GtfsDataViewer({ hostedUrl }: GtfsDataViewerProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const parquetMetaUrl = deriveParquetMetaUrl(hostedUrl);

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '6px !important',
        '&:before': { display: 'none' }, // remove MUI default top divider line
        bgcolor: 'background.paper',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          px: 3,
          py: 1,
          '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
        }}
      >
        <TableChartOutlinedIcon fontSize='small' color='action' />
        <Typography fontWeight={600}>Explore Dataset Tables</Typography>
        <Chip label='POC' size='small' color='warning' variant='outlined' sx={{ ml: 0.5 }} />
        {!expanded && (
          <Typography variant='caption' color='text.secondary' sx={{ ml: 1 }}>
            Browse stops, routes, trips, stop_times and more
          </Typography>
        )}
      </AccordionSummary>

      <AccordionDetails sx={{ p: 0, borderTop: '1px solid', borderColor: 'divider' }}>
        {expanded && (
          <>
            <Alert
              severity='info'
              icon={<InfoOutlinedIcon fontSize='small' />}
              sx={{
                mx: 2,
                mt: 2,
                mb: 0,
                fontSize: 12,
                py: 0.5,
                '& .MuiAlert-message': { py: 0.5 },
              }}
            >
              <strong>POC:</strong> Queries run entirely in your browser via DuckDB-WASM + HTTP Range
              requests. Only the rows you see are downloaded — no full file transfer.
            </Alert>

            <Box sx={{ p: 2 }}>
              <GtfsViewerClient initialUrl={parquetMetaUrl} embedded />
            </Box>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
