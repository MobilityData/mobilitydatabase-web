import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../../Theme';
import SealSection from './SealSection';
import { type ApiSealCriterionKey } from '../../../constants/sealCriteria';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type FeedReliabilityReport = components['schemas']['FeedReliabilityReport'];

function buildCriterion(
  criterion: ApiSealCriterionKey,
  overrides: Partial<ReliabilityCriterion> = {},
): ReliabilityCriterion {
  return {
    criterion,
    status: 'pass',
    in_grace_period: false,
    on_probation: false,
    ...overrides,
  };
}

// SealSection is a Server Component, and RTL can't render an async component
// directly - resolve it first, then render the tree it returns.
async function renderSection(
  reliability: FeedReliabilityReport | undefined,
): Promise<ReturnType<typeof render>> {
  const tree = await SealSection({ reliability });
  return render(<ThemeProvider theme={theme}>{tree}</ThemeProvider>);
}

describe('SealSection', () => {
  it('renders nothing without a reliability report', async () => {
    await renderSection(undefined);

    expect(screen.queryByTestId('seal-section')).not.toBeInTheDocument();
  });

  it('renders the seal and one entry per criterion with its display status', async () => {
    await renderSection({
      feed_id: 'mdb-1',
      has_seal: true,
      on_probation: false,
      criteria: [
        buildCriterion('official', { status: 'pass' }),
        buildCriterion('stable', { status: 'fail', in_grace_period: true }),
        buildCriterion('available', { status: 'fail' }),
        buildCriterion('compliant', { status: 'pass', on_probation: true }),
        buildCriterion('fresh_coverage', { status: 'not_applicable' }),
        buildCriterion('fresh_continuous', { status: 'unknown' }),
      ],
    });

    expect(screen.getByTestId('seal-section')).toBeInTheDocument();
    expect(screen.getByTestId('seal-of-reliability-image')).toBeInTheDocument();

    // Short titles, so the row stays readable - "Fresh" / "Continuous"
    // rather than the full "Fresh: Rolling 7 Days of Coverage".
    expect(
      screen.getByText('criteria.freshRolling.shortTitle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('criteria.freshContinuous.shortTitle'),
    ).toBeInTheDocument();

    expect(
      screen.getByTestId('seal-criterion-official-pass'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('seal-criterion-stable-atRisk'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('seal-criterion-available-fail'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('seal-criterion-compliant-probation'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('seal-criterion-freshRolling-notApplicable'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('seal-criterion-freshContinuous-notEvaluated'),
    ).toBeInTheDocument();
  });

  it('describes each criterion with its full title and status on hover', async () => {
    // A failing `official` reads with the unofficial copy, here and in the
    // feed detail page's tooltips
    const description =
      'criteria.official.title — sealCriterionFail: criteria.official.notAuthorizedDescription';

    await renderSection({
      feed_id: 'mdb-1',
      has_seal: false,
      on_probation: false,
      criteria: [buildCriterion('official', { status: 'fail' })],
    });

    // The row carries the full description as its accessible name
    expect(screen.getByLabelText(description)).toBeInTheDocument();

    userEvent.hover(screen.getByTestId('seal-criterion-official-fail'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(description);
  });
});

describe('SealSection status description', () => {
  it('describes a fully passing feed', async () => {
    await renderSection({
      feed_id: 'mdb-1',
      has_seal: true,
      on_probation: false,
      criteria: [buildCriterion('official'), buildCriterion('stable')],
    });

    expect(screen.getByText('sealEarnedLabel')).toBeInTheDocument();
    expect(screen.getByTestId('seal-status-description')).toHaveTextContent(
      'sealStatusEarnedDescription',
    );
    expect(screen.queryByTestId('probation-progress')).not.toBeInTheDocument();
  });

  it('describes a feed with criteria at risk', async () => {
    await renderSection({
      feed_id: 'mdb-1',
      has_seal: true,
      on_probation: false,
      criteria: [
        buildCriterion('compliant', {
          status: 'fail',
          in_grace_period: true,
          grace_period_ends_at: '2026-09-20T00:00:00Z',
        }),
        buildCriterion('available', {
          status: 'fail',
          in_grace_period: true,
          grace_period_ends_at: '2026-09-12T00:00:00Z',
        }),
      ],
    });

    expect(screen.getByText('sealInGracePeriodLabel')).toBeInTheDocument();
    expect(screen.getByTestId('seal-status-description')).toHaveTextContent(
      'sealStatusGracePeriodDescription',
    );
  });

  it('describes a feed that has not earned the seal', async () => {
    await renderSection({
      feed_id: 'mdb-1',
      has_seal: false,
      on_probation: false,
      criteria: [
        buildCriterion('official'),
        buildCriterion('stable', { status: 'fail' }),
      ],
    });

    expect(screen.getByText('sealNotYetEarnedLabel')).toBeInTheDocument();
    expect(screen.getByTestId('seal-status-description')).toHaveTextContent(
      'sealStatusNotEarnedDescription',
    );
  });

  it('describes a feed on probation and charts its window', async () => {
    await renderSection({
      feed_id: 'mdb-1',
      has_seal: false,
      on_probation: true,
      probation_ends_at: '2027-01-16T00:00:00Z',
      criteria: [buildCriterion('official'), buildCriterion('stable')],
    });

    expect(screen.getByText('sealOnProbationLabel')).toBeInTheDocument();
    expect(screen.getByTestId('seal-status-description')).toHaveTextContent(
      'sealStatusProbationDescription',
    );

    const probationProgress = screen.getByTestId('probation-progress');
    expect(probationProgress).toHaveTextContent('sealProbationStartDateLabel');
    expect(probationProgress).toHaveTextContent('sealProbationEarnDateLabel');
    expect(probationProgress).toHaveTextContent('sealProjectedSealDate');
    // Start is derived as the end minus the six probation months
    expect(probationProgress).toHaveTextContent('Jul 16, 2026');
    expect(probationProgress).toHaveTextContent('Jan 16, 2027');
  });

  it('omits the progress bar when probation reports no end date', async () => {
    await renderSection({
      feed_id: 'mdb-1',
      has_seal: false,
      on_probation: true,
      criteria: [buildCriterion('official')],
    });

    expect(screen.getByText('sealOnProbationLabel')).toBeInTheDocument();
    expect(screen.queryByTestId('probation-progress')).not.toBeInTheDocument();
  });
});
