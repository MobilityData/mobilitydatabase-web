'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Grid,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import { ExpandMore, Search } from '@mui/icons-material';
import React, { useEffect, useState } from 'react';
import NestedCheckboxList from '../../../../components/NestedCheckboxList';
import { SearchHeader } from '../../../../styles/Filters.styles';
import type { DiffDataset } from '../../lib/datasets';
import {
  EMPTY_FILTERS,
  type HighlightFilters,
  type HighlightsDoc,
  SECTION_ORDER,
  SEVERITIES,
  SEVERITY_LABELS,
  filterHighlights,
  parseHighlightFilters,
  writeHighlightFilters,
} from '../../lib/global-highlights';
import type { ReportSummary } from '../../lib/report';
import ReportLayout from '../report/ReportLayout';
import HighlightRow from './HighlightRow';

/** Section id and slug of this page in the report header. */
export const HIGHLIGHTS_SECTION = 'highlights';

interface HighlightsScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
  doc: HighlightsDoc;
}

/** The report with this page added, so the header titles it. */
function withHighlights(report: ReportSummary, total: number): ReportSummary {
  return {
    ...report,
    sections: [
      ...report.sections,
      {
        id: HIGHLIGHTS_SECTION,
        slug: HIGHLIGHTS_SECTION,
        label: 'Notable highlights',
        count: total,
        counts: null,
        files: [],
        present: true,
      },
    ],
  };
}

/** Same filter accordion as the feeds search page. */
function FilterGroup({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>): React.ReactElement {
  return (
    <Accordion
      defaultExpanded
      disableGutters
      variant='outlined'
      sx={{
        border: 0,
        bgcolor: 'transparent',
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMore />} sx={{ px: 0 }}>
        <SearchHeader variant='h6'>{title}</SearchHeader>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0, m: 0, border: 0 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

/**
 * /gtfs-diff-tool-v2/<dataset>/highlights: every notable highlight of the
 * diff, ranked across files, filtered by entity, severity and text. The
 * filters live in the query string (?entity=stops&severity=error&q=…).
 */
export default function HighlightsScreen({
  dataset,
  report,
  doc,
}: HighlightsScreenProps): React.ReactElement {
  // Derived values are memoized by the React Compiler.
  const header = withHighlights(report, doc.counts.total);
  const [filters, setFilters] = useState<HighlightFilters>(EMPTY_FILTERS);
  // The page is static: read the query string once mounted.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setFilters(
      parseHighlightFilters(new URLSearchParams(window.location.search)),
    );
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const { pathname, search, hash } = window.location;
    const params = new URLSearchParams(search);
    writeHighlightFilters(params, filters);
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      `${pathname}${qs ? `?${qs}` : ''}${hash}`,
    );
  }, [filters, ready]);

  const label = (id: string): string =>
    report.sections.find((s) => s.id === id)?.label ?? id;
  const sections = Object.keys(doc.counts.sections).sort(
    (a, b) =>
      (SECTION_ORDER.indexOf(a) + 1 || 99) -
      (SECTION_ORDER.indexOf(b) + 1 || 99),
  );
  const shown = filterHighlights(doc.items, filters, label);
  const filtered =
    filters.sections.length > 0 ||
    filters.severities.length > 0 ||
    filters.query !== '';
  const severityCount = (s: string): number =>
    s === 'error' ? doc.counts.error : doc.counts.warning;

  return (
    <ReportLayout
      dataset={dataset}
      report={header}
      section={HIGHLIGHTS_SECTION}
    >
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 3 }}>
          <FilterGroup title='Entity'>
            <NestedCheckboxList
              checkboxData={sections.map((s) => ({
                title: `${label(s)} (${doc.counts.sections[s]})`,
                type: 'checkbox',
                checked: filters.sections.includes(s),
              }))}
              onCheckboxChange={(data) =>
                setFilters((f) => ({
                  ...f,
                  sections: sections.filter((_, i) => data[i]?.checked),
                }))
              }
            />
          </FilterGroup>
          <FilterGroup title='Severity'>
            <NestedCheckboxList
              checkboxData={SEVERITIES.map((s) => ({
                title: `${SEVERITY_LABELS[s]} (${severityCount(s)})`,
                type: 'checkbox',
                checked: filters.severities.includes(s),
                disabled: severityCount(s) === 0,
              }))}
              onCheckboxChange={(data) =>
                setFilters((f) => ({
                  ...f,
                  severities: SEVERITIES.filter((_, i) => data[i]?.checked),
                }))
              }
            />
          </FilterGroup>
        </Grid>

        <Grid size={{ xs: 12, md: 9 }}>
          <TextField
            fullWidth
            size='small'
            placeholder='Search highlights, stops, routes, services…'
            value={filters.query}
            onChange={(e) =>
              setFilters((f) => ({ ...f, query: e.target.value }))
            }
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position='start'>
                    <Search fontSize='small' />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 1.5 }}
          />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
              mb: 2,
              minHeight: 32,
            }}
          >
            <Typography variant='body2' color='text.secondary' sx={{ mr: 1 }}>
              {filtered
                ? `${shown.length.toLocaleString()} of ${doc.counts.total.toLocaleString()} highlights`
                : `${doc.counts.total.toLocaleString()} highlights, most concerning first`}
            </Typography>
            {filters.sections.map((s) => (
              <Chip
                key={s}
                size='small'
                label={label(s)}
                onDelete={() =>
                  setFilters((f) => ({
                    ...f,
                    sections: f.sections.filter((x) => x !== s),
                  }))
                }
              />
            ))}
            {filters.severities.map((s) => (
              <Chip
                key={s}
                size='small'
                label={SEVERITY_LABELS[s]}
                onDelete={() =>
                  setFilters((f) => ({
                    ...f,
                    severities: f.severities.filter((x) => x !== s),
                  }))
                }
              />
            ))}
            {filtered ? (
              <Button
                size='small'
                onClick={() => setFilters(EMPTY_FILTERS)}
                sx={{ textTransform: 'none' }}
              >
                Clear all
              </Button>
            ) : null}
          </Box>

          {doc.counts.total === 0 ? (
            <Typography variant='body2' color='text.secondary'>
              Nothing concerning stood out in this diff.
            </Typography>
          ) : shown.length === 0 ? (
            <Typography variant='body2' color='text.secondary'>
              No highlight matches these filters.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gap: 1 }}>
              {shown.map((h) => (
                <HighlightRow
                  key={h.key}
                  highlight={h}
                  datasetId={dataset.id}
                  sectionLabel={label(h.section)}
                />
              ))}
            </Box>
          )}
        </Grid>
      </Grid>
    </ReportLayout>
  );
}
