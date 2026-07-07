import { Chip, Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import VerifiedIcon from '@mui/icons-material/Verified';
import GroupsIcon from '@mui/icons-material/Groups';

interface FeedVerificationChipProps {
  isLongDisplay?: boolean;
  status?: boolean;
}

const officialBadgeStyle = {
  background:
    'linear-gradient(25deg, var(--mui-palette-primary-light), var(--mui-palette-primary-dark))',
  color: 'white',
};

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
          sx={{ opacity: 0.8 }}
          icon={<GroupsIcon></GroupsIcon>}
          label={t('communityFeed')}
          variant='filled'
        ></Chip>
      </Tooltip>
    ) : (
      <Tooltip title={t('communityFeedTooltipShort')} placement='top'>
        <GroupsIcon
          sx={{
            display: 'block',
            ml: 0,
            mr: 2,
            opacity: 0.6,
            backgroundColor: 'var(--mui-palette-grey-400)',
            color: 'var(--mui-palette-text-primary)',
            borderRadius: '50%',
            padding: '0.2rem',
          }}
        ></GroupsIcon>
      </Tooltip>
    );
  }

  return isLongDisplay ? (
    <Tooltip title={t('officialFeedTooltip')} placement='top'>
      <Chip
        sx={officialBadgeStyle}
        icon={<VerifiedIcon sx={{ fill: 'white' }}></VerifiedIcon>}
        label={t('officialFeed')}
      ></Chip>
    </Tooltip>
  ) : (
    <Tooltip title={t('officialFeedTooltipShort')} placement='top'>
      <VerifiedIcon
        sx={{
          display: 'block',
          borderRadius: '50%',
          padding: '0.1rem',
          ml: 0,
          mr: 2,
          ...officialBadgeStyle,
        }}
      ></VerifiedIcon>
    </Tooltip>
  );
}
