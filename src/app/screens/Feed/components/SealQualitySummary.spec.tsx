import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../../Theme';
import SealQualitySummary from './SealQualitySummary';
import { type ApiSealCriterionKey } from '../../../constants/sealCriteria';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];
type FeedReliabilityReport = components['schemas']['FeedReliabilityReport'];

jest.mock('../../../../i18n/navigation', () => ({
  Link: ({
    children,
    href,
  }: React.PropsWithChildren<{ href: string }>): React.ReactElement => (
    <a href={href}>{children}</a>
  ),
}));

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

function buildReliability(
  overrides: Partial<FeedReliabilityReport> = {},
): FeedReliabilityReport {
  return {
    feed_id: 'mdb-1',
    has_seal: false,
    on_probation: false,
    criteria: [],
    ...overrides,
  };
}

function renderSummary(
  reliability: FeedReliabilityReport | undefined,
): ReturnType<typeof render> {
  return render(
    <ThemeProvider theme={theme}>
      <SealQualitySummary
        feedId='mdb-1'
        feedDataType='gtfs'
        reliability={reliability}
      />
    </ThemeProvider>,
  );
}

describe('SealQualitySummary', () => {
  it('renders the not-yet-earned status with no caption when there is no reliability data', () => {
    renderSummary(undefined);

    expect(screen.getByTestId('BlockIcon')).toBeInTheDocument();
    expect(screen.getByText('sealNotYetEarnedLabel')).toBeInTheDocument();
    expect(
      screen.queryByText('sealCriteriaMetCaption'),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^criterion-/)).toHaveLength(0);
  });

  it('renders the not-yet-earned status with a criteria-met caption when criteria are considered', () => {
    renderSummary(
      buildReliability({
        has_seal: false,
        criteria: [
          buildCriterion('official', { status: 'pass' }),
          buildCriterion('stable', { status: 'fail', in_grace_period: false }),
        ],
      }),
    );

    expect(screen.getByTestId('BlockIcon')).toBeInTheDocument();
    expect(screen.getByText('sealNotYetEarnedLabel')).toBeInTheDocument();
    expect(screen.getByText('sealCriteriaMetCaption')).toBeInTheDocument();
    expect(screen.getByTestId('criterion-official-pass')).toBeInTheDocument();
    expect(screen.getByTestId('criterion-stable-fail')).toBeInTheDocument();
  });

  it('does not count not_applicable criteria towards the criteria-met caption', () => {
    renderSummary(
      buildReliability({
        has_seal: false,
        criteria: [
          buildCriterion('official', { status: 'not_applicable' }),
          buildCriterion('stable', { status: 'not_applicable' }),
        ],
      }),
    );

    expect(
      screen.queryByText('sealCriteriaMetCaption'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('criterion-official-notApplicable'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('criterion-stable-notApplicable'),
    ).toBeInTheDocument();
  });

  it('renders the earned status when the seal is held and no criterion is in its grace period', () => {
    renderSummary(
      buildReliability({
        has_seal: true,
        criteria: [
          buildCriterion('official', { status: 'pass' }),
          buildCriterion('stable', { status: 'pass' }),
        ],
      }),
    );

    expect(screen.getByTestId('CheckCircleIcon')).toBeInTheDocument();
    expect(screen.getByText('sealEarnedLabel')).toBeInTheDocument();
    expect(screen.getByText('sealEarnedCaption')).toBeInTheDocument();
    expect(
      screen.queryByText('sealCriteriaMetCaption'),
    ).not.toBeInTheDocument();
  });

  it('renders the grace-period status when the seal is held but a criterion is at risk', () => {
    renderSummary(
      buildReliability({
        has_seal: true,
        criteria: [
          buildCriterion('official', {
            status: 'fail',
            in_grace_period: true,
            grace_period_ends_at: '2026-08-24T04:00:00Z',
          }),
          buildCriterion('stable', { status: 'pass' }),
        ],
      }),
    );

    expect(screen.getByTestId('WarningAmberIcon')).toBeInTheDocument();
    expect(screen.getByText('sealInGracePeriodLabel')).toBeInTheDocument();
    expect(screen.getByText('sealGracePeriodCaption')).toBeInTheDocument();
    expect(screen.getByTestId('criterion-official-atRisk')).toBeInTheDocument();
    expect(screen.getByTestId('criterion-stable-pass')).toBeInTheDocument();
  });

  it('treats a failure outside its grace period as a real failure, not at-risk', () => {
    renderSummary(
      buildReliability({
        has_seal: true,
        criteria: [
          buildCriterion('official', {
            status: 'fail',
            in_grace_period: false,
          }),
        ],
      }),
    );

    expect(screen.getByTestId('criterion-official-fail')).toBeInTheDocument();
  });

  it.each(['unknown', 'never_evaluated'] as const)(
    'renders a %s criterion as notEvaluated',
    (status) => {
      renderSummary(
        buildReliability({
          criteria: [buildCriterion('available', { status })],
        }),
      );

      expect(
        screen.getByTestId('criterion-available-notEvaluated'),
      ).toBeInTheDocument();
    },
  );

  it('links to the full seal-of-reliability analysis page', () => {
    renderSummary(buildReliability());

    const link = screen.getByRole('link', {
      name: 'See Full Seal of Reliability Analysis',
    });
    expect(link).toHaveAttribute(
      'href',
      '/feeds/gtfs/mdb-1/seal-of-reliability',
    );
  });
});
