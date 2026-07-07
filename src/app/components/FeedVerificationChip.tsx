'use client';
import { Chip, Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import VerifiedIcon from '@mui/icons-material/Verified';
import GroupsIcon from '@mui/icons-material/Groups';

interface FeedVerificationChipProps {
  isLongDisplay?: boolean;
  status?: boolean;
}

export default function FeedVerificationChip({
  isLongDisplay = true,
  status,
}: FeedVerificationChipProps): React.ReactElement | null {
  const t = useTranslations('feeds');

  if (status == undefined) {
    return null;
  }

  if (!status) {
    return isLongDisplay ? (
      <Tooltip title={t('communityFeedTooltip')} placement='top'>
        <Chip
          data-testid='community-feed-chip'
          sx={{ opacity: 0.8 }}
          icon={<GroupsIcon></GroupsIcon>}
          label={t('communityFeed')}
          variant='filled'
        ></Chip>
      </Tooltip>
    ) : (
      <Tooltip title={t('communityFeedTooltipShort')} placement='top'>
        <GroupsIcon
          data-testid='community-feed-icon'
          sx={(theme) => ({
            display: 'block',
            ml: 0,
            mr: 2,
            opacity: 0.6,
            backgroundColor: theme.vars.palette.grey[400],
            color: theme.vars.palette.text.primary,
            borderRadius: '50%',
            padding: '0.2rem',
          })}
        ></GroupsIcon>
      </Tooltip>
    );
  }

  return isLongDisplay ? (
    <Tooltip title={t('officialFeedTooltip')} placement='top'>
      <Chip
        data-testid='official-feed-chip'
        sx={(theme) => ({
          background: `linear-gradient(25deg, ${theme.vars.palette.primary.light}, ${theme.vars.palette.primary.dark})`,
          color: 'white',
        })}
        icon={<VerifiedIcon sx={{ fill: 'white' }}></VerifiedIcon>}
        label={t('officialFeed')}
      ></Chip>
    </Tooltip>
  ) : (
    <Tooltip title={t('officialFeedTooltipShort')} placement='top'>
      <VerifiedIcon
        data-testid='official-feed-icon'
        sx={(theme) => ({
          display: 'block',
          borderRadius: '50%',
          padding: '0.1rem',
          ml: 0,
          mr: 2,
          background: `linear-gradient(25deg, ${theme.vars.palette.primary.light}, ${theme.vars.palette.primary.dark})`,
          color: 'white',
        })}
      ></VerifiedIcon>
    </Tooltip>
  );
}
