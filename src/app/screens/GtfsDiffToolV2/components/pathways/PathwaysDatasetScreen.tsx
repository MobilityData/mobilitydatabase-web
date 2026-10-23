'use client';

import TransitLoader from '../TransitLoader';
import { Alert } from '@mui/material';
import React from 'react';
import type { DiffDataset } from '../../lib/datasets';
import type { ReportSummary } from '../../lib/report';
import ReportLayout from '../report/ReportLayout';
import type { PathwaysDiff } from '../../lib/pathways-types';
import { useDiffData } from '../../lib/useDiffData';
import PathwaysDiffScreen from './PathwaysDiffScreen';

interface PathwaysDatasetScreenProps {
  dataset: DiffDataset;
  report: ReportSummary;
}

/** Loads a dataset's pathways-diff.json, then renders the pathways view. */
export default function PathwaysDatasetScreen({
  dataset,
  report,
}: PathwaysDatasetScreenProps): React.ReactElement {
  const { data, error } = useDiffData<PathwaysDiff>(dataset.id, 'pathways');
  if (data != null)
    return <PathwaysDiffScreen diff={data} dataset={dataset} report={report} />;
  return (
    <ReportLayout dataset={dataset} report={report} section='pathways'>
      {error != null ? (
        <Alert severity='error'>
          Could not load the pathways diff of {dataset.label}: {error.message}
        </Alert>
      ) : (
        <TransitLoader label={`Loading pathways for ${dataset.label}…`} />
      )}
    </ReportLayout>
  );
}
