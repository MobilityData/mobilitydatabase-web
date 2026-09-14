import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../../Theme';
import CriterionSection from './CriterionSection';
import {
  type ApiSealCriterionKey,
  type SealCriterionContext,
} from '../../../constants/sealCriteria';
import { type components } from '../../../services/feeds/types';

type ReliabilityCriterion = components['schemas']['ReliabilityCriterion'];

jest.mock('../../../../i18n/navigation', () => ({
  Link: ({
    children,
    href,
  }: React.PropsWithChildren<{ href: string }>): React.ReactElement => (
    <a href={href}>{children}</a>
  ),
}));

const NOW = new Date('2026-09-08T00:00:00Z');
const RECENTLY_ADDED = '2026-07-01T00:00:00Z';
const LONG_ESTABLISHED = '2024-01-01T00:00:00Z';

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

function renderSection(
  criterion: ReliabilityCriterion,
  context?: SealCriterionContext,
  producerUrl?: string,
): ReturnType<typeof render> {
  return render(
    <ThemeProvider theme={theme}>
      <CriterionSection
        criterion={criterion}
        context={context}
        producerUrl={producerUrl}
        statusChip={null}
      />
    </ThemeProvider>,
  );
}

beforeAll(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['performance'] });
});

afterAll(() => {
  jest.useRealTimers();
});

describe('CriterionSection official', () => {
  it('reads as authorized when it passes', () => {
    renderSection(buildCriterion('official', { status: 'pass' }));

    expect(
      screen.getByTestId('criterion-section-official'),
    ).toBeInTheDocument();
    expect(screen.getByText('criteria.official.subtitle')).toBeInTheDocument();
    expect(
      screen.getByText('criteria.official.description'),
    ).toBeInTheDocument();
  });

  it('reads as not authorized when it fails', () => {
    renderSection(buildCriterion('official', { status: 'fail' }));

    expect(
      screen.getByText('criteria.official.notAuthorizedSubtitle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('criteria.official.notAuthorizedDescription'),
    ).toBeInTheDocument();
  });
});

describe('CriterionSection stable', () => {
  it('shows the URL comparison when the producer URL is flagged unstable', () => {
    renderSection(
      buildCriterion('stable', { status: 'fail' }),
      { isProducerUrlUnstable: true, feedCreatedAt: LONG_ESTABLISHED },
      'https://agency.gov/gtfs/2026-09-08.zip',
    );

    expect(
      screen.getByText('criteria.stable.unstableUrlSubtitle'),
    ).toBeInTheDocument();

    const comparison = screen.getByTestId('producer-url-comparison');
    expect(comparison).toHaveTextContent('sealCurrentProducerUrlLabel');
    expect(comparison).toHaveTextContent(
      'https://agency.gov/gtfs/2026-09-08.zip',
    );
    expect(comparison).toHaveTextContent('sealStableUrlExampleLabel');
    expect(comparison).toHaveTextContent('sealStableUrlExample');
  });

  it('omits the comparison when the feed reports no producer URL', () => {
    renderSection(buildCriterion('stable', { status: 'fail' }), {
      isProducerUrlUnstable: true,
    });

    expect(
      screen.queryByTestId('producer-url-comparison'),
    ).not.toBeInTheDocument();
  });

  it('reads as building a record for a young failing feed', () => {
    renderSection(buildCriterion('stable', { status: 'fail' }), {
      isProducerUrlUnstable: false,
      feedCreatedAt: RECENTLY_ADDED,
    });

    expect(
      screen.getByText('criteria.stable.buildingRecordSubtitle'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('producer-url-comparison'),
    ).not.toBeInTheDocument();
  });

  it('keeps the default copy when it passes', () => {
    renderSection(
      buildCriterion('stable', { status: 'pass' }),
      { isProducerUrlUnstable: false, feedCreatedAt: LONG_ESTABLISHED },
      'https://agency.gov/gtfs/schedule.zip',
    );

    expect(screen.getByText('criteria.stable.subtitle')).toBeInTheDocument();
    expect(
      screen.queryByTestId('producer-url-comparison'),
    ).not.toBeInTheDocument();
  });

  it('adds the deadline when a criterion is inside a grace period', () => {
    renderSection(
      buildCriterion('stable', {
        status: 'fail',
        in_grace_period: true,
        grace_period_ends_at: '2026-09-20T00:00:00Z',
      }),
      { feedCreatedAt: LONG_ESTABLISHED },
    );

    expect(
      screen.getByText('sealCriterionGracePeriodNote'),
    ).toBeInTheDocument();
  });
});
