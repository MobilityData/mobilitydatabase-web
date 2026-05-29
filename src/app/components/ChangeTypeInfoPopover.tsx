'use client';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';

export const CHANGE_TYPE_INFO: Record<
  string,
  { title: string; items: Array<{ term: string; description: string }> }
> = {
  breaking: {
    title: 'Breaking Changes',
    items: [
      {
        term: 'Removed required field',
        description:
          'A field marked required in the spec is absent in the new feed.',
      },
      {
        term: 'Removed entity',
        description:
          'A stop_id, route_id, trip_id, or agency_id that existed before is gone entirely.',
      },
      {
        term: 'Changed primary key / ID rename',
        description:
          'An entity ID value changed (e.g. stop_id 123 renamed to STM-123), breaking all foreign key references.',
      },
      {
        term: 'Changed field type or format',
        description:
          'e.g. a time field switching from HH:MM:SS to epoch seconds, or a numeric field becoming a string.',
      },
      {
        term: 'Removed file',
        description:
          'An entire .txt file (e.g. calendar.txt) is absent with no functional replacement.',
      },
      {
        term: 'Referential integrity broken',
        description:
          'A foreign key reference points to a non-existent entity (e.g. trips.txt references a shape_id missing from shapes.txt).',
      },
      {
        term: 'Enum value removed or changed',
        description:
          'A previously valid enum value (e.g. route_type, pickup_type) is gone or renumbered.',
      },
      {
        term: 'Feed validity window shrunk to past',
        description:
          'feed_info.feed_end_date is in the past \u2014 all trips are technically expired.',
      },
    ],
  },
  suspicious: {
    title: 'Suspicious Changes',
    items: [
      {
        term: 'Large entity count delta',
        description:
          'Row count changed by more than N% (e.g. >20%) for any file \u2014 sudden mass addition or deletion of stops/trips.',
      },
      {
        term: 'Geographic bounding box shift',
        description:
          'The min/max lat/lon envelope of stops moved significantly \u2014 may indicate a coordinate system error or wrong feed published.',
      },
      {
        term: 'Stop coordinates moved far',
        description:
          'Any individual stop moved more than X meters (e.g. >500 m) between versions.',
      },
      {
        term: 'Service coverage date gap',
        description:
          'Gap between the previous feed end date and new feed start date \u2014 service days with no coverage.',
      },
      {
        term: 'Massive schedule change outside known dates',
        description:
          'Trip count or departure time distribution changed drastically outside of a declared service change date.',
      },
      {
        term: 'Headsign or route name bulk change',
        description:
          'A high percentage of trip_headsign or route_long_name values changed \u2014 possible encoding issue or bulk error.',
      },
      {
        term: 'Shape geometry distortion',
        description:
          'Shape distances or point sequences changed in ways inconsistent with minor route edits.',
      },
      {
        term: 'Calendar / calendar_dates flip',
        description:
          'Service switched from calendar.txt-based to calendar_dates.txt-only (or vice versa) without prior notice.',
      },
      {
        term: 'Agency timezone change',
        description:
          'agency_timezone changed \u2014 affects all absolute time interpretation.',
      },
      {
        term: 'Feed publisher change',
        description:
          'feed_publisher_name or feed_publisher_url changed \u2014 may indicate a feed source swap.',
      },
      {
        term: 'Duplicate IDs introduced',
        description: 'IDs that were unique before now appear more than once.',
      },
      {
        term: 'Arrival/departure time ordering violations',
        description:
          'Stop times within a trip are no longer monotonically increasing.',
      },
    ],
  },
};

interface Props {
  anchor: HTMLElement | null;
  type: string | null;
  onClose: () => void;
}

export default function ChangeTypeInfoPopover({
  anchor,
  type,
  onClose,
}: Props): React.ReactElement | null {
  if (anchor === null || type === null) return null;
  const info = CHANGE_TYPE_INFO[type];
  if (info == null) return null;

  return (
    <Popover
      open
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Box
        sx={{
          maxWidth: 500,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 360,
          backgroundColor: 'background.default',
        }}
      >
        {/* Sticky header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2.5,
            py: 1.5,
            position: 'sticky',
            top: 0,
            bgcolor: 'background.default',
            zIndex: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant='subtitle1' fontWeight={700}>
            {info.title}
          </Typography>
          <IconButton
            size='small'
            onClick={onClose}
            aria-label='Close'
            sx={{ ml: 2 }}
          >
            <CloseIcon fontSize='small' />
          </IconButton>
        </Box>
        {/* Scrollable content */}
        <Box sx={{ p: 2.5, overflow: 'auto' }}>
          {info.items.map(({ term, description }) => (
            <Box key={term} sx={{ mb: 1.5 }}>
              <Typography variant='body2' fontWeight={600}>
                {term}
              </Typography>
              <Typography variant='body2' color='text.secondary'>
                {description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Popover>
  );
}
