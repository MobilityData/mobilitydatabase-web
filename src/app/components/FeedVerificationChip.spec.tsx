import React, { type JSX } from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { theme } from '../Theme';
import FeedVerificationChip from './FeedVerificationChip';

// next-intl is globally mocked in setupTests.ts: useTranslations returns (key) => key

function wrapper({ children }: { children: React.ReactNode }): JSX.Element {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

describe('FeedVerificationChip', () => {
  describe('when status is undefined', () => {
    it('renders nothing', () => {
      const { container } = render(<FeedVerificationChip />, { wrapper });
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('when status is true (official feed)', () => {
    it('renders the official chip with label in long display mode (default)', () => {
      render(<FeedVerificationChip status={true} />, { wrapper });
      expect(screen.getByTestId('official-feed-chip')).toBeInTheDocument();
      expect(screen.getByText('officialFeed')).toBeInTheDocument();
    });

    it('renders the official icon in short display mode', () => {
      render(<FeedVerificationChip status={true} isLongDisplay={false} />, { wrapper });
      expect(screen.getByTestId('official-feed-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('official-feed-chip')).not.toBeInTheDocument();
    });
  });

  describe('when status is false (community feed)', () => {
    it('renders the community chip with label in long display mode (default)', () => {
      render(<FeedVerificationChip status={false} />, { wrapper });
      expect(screen.getByTestId('community-feed-chip')).toBeInTheDocument();
      expect(screen.getByText('communityFeed')).toBeInTheDocument();
    });

    it('renders the community icon in short display mode', () => {
      render(<FeedVerificationChip status={false} isLongDisplay={false} />, { wrapper });
      expect(screen.getByTestId('community-feed-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('community-feed-chip')).not.toBeInTheDocument();
    });
  });

  describe('long display mode (isLongDisplay=true)', () => {
    it('renders official chip — not icon — for status=true', () => {
      render(<FeedVerificationChip status={true} isLongDisplay={true} />, { wrapper });
      expect(screen.getByTestId('official-feed-chip')).toBeInTheDocument();
      expect(screen.queryByTestId('official-feed-icon')).not.toBeInTheDocument();
    });

    it('renders community chip — not icon — for status=false', () => {
      render(<FeedVerificationChip status={false} isLongDisplay={true} />, { wrapper });
      expect(screen.getByTestId('community-feed-chip')).toBeInTheDocument();
      expect(screen.queryByTestId('community-feed-icon')).not.toBeInTheDocument();
    });
  });

  describe('short display mode (isLongDisplay=false)', () => {
    it('renders official icon — not chip — for status=true', () => {
      render(<FeedVerificationChip status={true} isLongDisplay={false} />, { wrapper });
      expect(screen.getByTestId('official-feed-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('official-feed-chip')).not.toBeInTheDocument();
    });

    it('renders community icon — not chip — for status=false', () => {
      render(<FeedVerificationChip status={false} isLongDisplay={false} />, { wrapper });
      expect(screen.getByTestId('community-feed-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('community-feed-chip')).not.toBeInTheDocument();
    });
  });
});
