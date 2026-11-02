import { type ReactElement } from 'react';
import { Box, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import { getEmojiFlag, type TCountryCode } from 'countries-list';
import { Link } from '../../../../i18n/navigation';
import {
  buildLocationHref,
  formatCount,
  getFeedCountEntries,
  getTotalFeedCount,
  type LocationDirectoryNode,
} from '../lib/location-directory';

interface Props {
  nodes: LocationDirectoryNode[];
  /** Slugs of the current node; each child links one level deeper. */
  parentSlugs: string[];
  locale: string;
}

function getDisplayName(node: LocationDirectoryNode): string {
  const name = node.name ?? node.slug ?? '';
  if (node.level === 'country' && node.code != undefined) {
    const flag = getEmojiFlag(node.code.toUpperCase() as TCountryCode);
    return flag !== '' ? `${flag} ${name}` : name;
  }
  return name;
}

/** Child nodes as link tiles, each with its GTFS / GTFS-RT / GBFS counts. */
export default async function LocationChildrenGrid({
  nodes,
  parentSlugs,
  locale,
}: Props): Promise<ReactElement> {
  const t = await getTranslations('locations');

  return (
    <Box
      component='ul'
      data-testid='location-children'
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          sm: 'repeat(2, minmax(0, 1fr))',
          md: 'repeat(3, minmax(0, 1fr))',
          lg: 'repeat(4, minmax(0, 1fr))',
        },
        gap: 1.5,
        '& a': {
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          height: '100%',
          boxSizing: 'border-box',
          px: 2,
          py: 1.5,
          borderRadius: '6px',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
          color: 'text.primary',
          textDecoration: 'none',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
        },
        '& a:hover': {
          borderColor: 'primary.main',
          bgcolor: 'background.paper',
        },
        '& a:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '2px',
        },
      }}
    >
      {nodes.map((node) => {
        const counts = getFeedCountEntries(node.feed_counts);
        const href = buildLocationHref([...parentSlugs, node.slug ?? '']);
        return (
          <li key={node.slug}>
            <Link href={href}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Typography
                  component='span'
                  sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}
                >
                  {getDisplayName(node)}
                </Typography>
                <Typography
                  component='span'
                  variant='body2'
                  color='text.secondary'
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {t('childFeedTotal', {
                    count: getTotalFeedCount(node.feed_counts),
                  })}
                </Typography>
              </Box>
              <Box
                component='span'
                sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5 }}
              >
                {counts.map(({ dataType, count }) => (
                  <Typography
                    key={dataType}
                    component='span'
                    variant='caption'
                    sx={{
                      color: count > 0 ? 'text.secondary' : 'text.disabled',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t(`shortLabels.${dataType}`)}{' '}
                    <Box
                      component='span'
                      sx={{
                        fontWeight: 700,
                        color: count > 0 ? 'text.primary' : 'inherit',
                      }}
                    >
                      {formatCount(count, locale)}
                    </Box>
                  </Typography>
                ))}
              </Box>
            </Link>
          </li>
        );
      })}
    </Box>
  );
}
