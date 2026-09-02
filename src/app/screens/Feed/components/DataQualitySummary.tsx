import * as React from 'react';
import { Box, Chip, Tooltip } from '@mui/material';
import { CheckCircle, EventRepeat, ReportOutlined } from '@mui/icons-material';
import { type components } from '../../../services/feeds/types';
import { WarningContentBox } from '../../../components/WarningContentBox';
import { FeedStatusChip } from '../../../components/FeedStatus';
import FeedVerificationChip from '../../../components/FeedVerificationChip';
import SealOfReliabilityChip from '../../../components/SealOfReliabilityChip';
import { getTranslations } from 'next-intl/server';
import { getUserRemoteConfigValues } from '../../../../lib/remote-config.server';

export interface DataQualitySummaryProps {
  feedStatus: components['schemas']['Feed']['status'];
  isOfficialFeed: boolean | undefined;
  latestDataset: components['schemas']['GtfsDataset'] | undefined;
  feedId: string;
  feedDataType: string;
  hasSeal: boolean | undefined;
  isSeasonal: boolean | undefined;
}

// Because this is a server component, the page will not render until the data is ready, hence the async
export default async function DataQualitySummary({
  feedStatus,
  isOfficialFeed,
  latestDataset,
  feedId,
  feedDataType,
  hasSeal,
  isSeasonal,
}: DataQualitySummaryProps): Promise<React.ReactElement> {
  const [t, tCommon, config] = await Promise.all([
    getTranslations('feeds'),
    getTranslations('common'),
    getUserRemoteConfigValues(),
  ]);

  return (
    <Box data-testid='data-quality-summary' sx={{ my: 2 }}>
      {latestDataset?.validation_report == undefined && (
        <WarningContentBox>{t('errorLoadingQualityReport')}</WarningContentBox>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {config.enableFeedStatusBadge && (
          <FeedStatusChip status={feedStatus ?? ''}></FeedStatusChip>
        )}
        {config.enableSealOfReliability && (
          <SealOfReliabilityChip
            hasSeal={hasSeal}
            feedId={feedId}
            feedDataType={feedDataType}
          />
        )}
        <FeedVerificationChip status={isOfficialFeed}></FeedVerificationChip>
        {isSeasonal === true && (
          <Tooltip title={t('seasonalFeedTooltip')} placement='top'>
            <Chip
              data-testid='seasonal-feed-chip'
              icon={<EventRepeat />}
              label={t('seasonalFeed')}
              variant='outlined'
              color='info'
            />
          </Tooltip>
        )}
        {latestDataset?.validation_report !== undefined &&
          latestDataset.validation_report !== null && (
            <>
              <Chip
                data-testid='error-count'
                clickable={Boolean(latestDataset?.validation_report?.url_html)}
                component='a'
                href={latestDataset?.validation_report?.url_html ?? undefined}
                target='_blank'
                rel='noopener noreferrer nofollow'
                icon={
                  latestDataset?.validation_report?.unique_error_count !==
                    undefined &&
                  latestDataset?.validation_report?.unique_error_count > 0 ? (
                    <ReportOutlined />
                  ) : (
                    <CheckCircle />
                  )
                }
                label={
                  latestDataset?.validation_report?.unique_error_count !==
                    undefined &&
                  latestDataset?.validation_report?.unique_error_count > 0
                    ? `${
                        latestDataset?.validation_report?.unique_error_count
                      } ${tCommon('feedback.errors')}`
                    : tCommon('feedback.noErrors')
                }
                color={
                  latestDataset?.validation_report?.unique_error_count !==
                    undefined &&
                  latestDataset?.validation_report?.unique_error_count > 0
                    ? 'error'
                    : 'success'
                }
                variant='outlined'
              />
            </>
          )}
      </Box>
    </Box>
  );
}
