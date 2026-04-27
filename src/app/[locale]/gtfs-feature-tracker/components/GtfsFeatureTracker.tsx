'use client';

import { useState, useMemo, memo, type ReactElement, Fragment } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Collapse,
  LinearProgress,
  Paper,
  Tooltip,
  Link as MuiLink,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import DatasetIcon from '@mui/icons-material/Dataset';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import AddIcon from '@mui/icons-material/Add';
import Image from 'next/image';
import type { Feature, GtfsFeatureTrackerProps } from './types';
import {
  getStatusText,
  getStatusIcon,
  computeCategoryProgress,
  formatDate,
  tokenizeDetail,
} from './GtfsFeatureTracker.helpers';

const CONTRIBUTE_URL = 'https://forms.gle/W3iJGgoaPDYLypZ38';

const CONSUMER_TYPES = [
  'Journey Planner',
  'Open Source Journey Planner',
  'Specialized Journey Planner',
] as const;

const CONSUMER_LOGOS: Record<string, string> = {
  google: '/assets/tripPlannerLogos/gmaps.png',
  transitapp: '/assets/tripPlannerLogos/transitapp.png',
  motis: '/assets/tripPlannerLogos/motis.png',
  opentripplanner: '/assets/tripPlannerLogos/opentripplanner.png',
  aubin: '/assets/tripPlannerLogos/aubin-app.png',
};

// ── FeatureDetail ─────────────────────────────────────────────────────────────
// Extracted as a memo component (rerender-memo) so each cell only re-renders
// when its own text or the knownFields set changes.

const FeatureDetail = memo(function FeatureDetail({
  text,
  knownFieldsSet,
}: {
  text: string;
  knownFieldsSet: Set<string>;
}): ReactElement {
  const segments = tokenizeDetail(text, knownFieldsSet);
  return (
    <Typography
      variant='caption'
      component='span'
      sx={{
        color: 'text.secondary',
        fontStyle: 'italic',
        lineHeight: 1.6,
      }}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'mdlink')
          return (
            <MuiLink
              key={i}
              href={seg.url}
              target='_blank'
              rel='noopener noreferrer'
              underline='hover'
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}
            >
              {seg.label}
              <OpenInNewIcon sx={{ fontSize: 'inherit' }} />
            </MuiLink>
          );
        if (seg.type === 'url')
          return (
            <MuiLink
              key={i}
              href={seg.value}
              target='_blank'
              rel='noopener noreferrer'
              underline='hover'
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}
            >
              Learn more
              <OpenInNewIcon fontSize='inherit' />
            </MuiLink>
          );
        if (seg.type === 'file')
          return (
            <Box
              key={i}
              component='code'
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.73rem',
                fontStyle: 'normal',
                color: 'info.main',
                bgcolor: 'action.hover',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '3px',
                px: '4px',
                verticalAlign: 'middle',
              }}
            >
              {seg.value}
            </Box>
          );
        if (seg.type === 'field')
          return (
            <Box
              key={i}
              component='code'
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.73rem',
                fontStyle: 'normal',
                color: 'text.secondary',
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '3px',
                px: '2px',
                verticalAlign: 'middle',
              }}
            >
              {seg.value}
            </Box>
          );
        return <Fragment key={i}>{seg.value}</Fragment>;
      })}
    </Typography>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export default function GtfsFeatureTracker({
  features,
  consumers,
  knownFields,
}: GtfsFeatureTrackerProps): ReactElement {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});

  const knownFieldsSet = useMemo(() => new Set(knownFields), [knownFields]);

  const filteredConsumers = useMemo(() => {
    if (selectedType === null) return consumers;
    return consumers.filter((c) => c.type === selectedType);
  }, [consumers, selectedType]);

  // Combined into one loop (js-combine-iterations): avoids iterating `features` twice
  const { categories, featuresByCategory } = useMemo(() => {
    const cats: string[] = [];
    const map: Record<string, Feature[]> = {};
    for (const f of features) {
      if (map[f.category] === undefined) {
        cats.push(f.category);
        map[f.category] = [];
      }
      map[f.category].push(f);
    }
    return { categories: cats, featuresByCategory: map };
  }, [features]);

  const toggleCategory = (category: string): void => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !(prev[category] ?? true),
    }));
  };

  const isCategoryExpanded = (category: string): boolean => {
    return expandedCategories[category] ?? true;
  };

  return (
    <Box
      sx={(theme) => ({
        maxWidth: theme.breakpoints.values.xl,
        mx: 'auto',
      })}
    >
      <Typography
        variant='h1'
        sx={(theme) => ({
          maxWidth: theme.breakpoints.values.xl,
          mx: 3,
          mb: 3,
        })}
      >
        GTFS Features Adoption Tracker
      </Typography>
      <Box
        sx={{
          mx: 3,
          bgcolor: 'background.paper',
          borderRadius: 3,
          p: 3,
        }}
      >
        <Typography variant='h5' sx={{ mb: 2, opacity: 0.7 }}>
          Consumers
        </Typography>
        {/* Consumer Legend */}
        <Box
          sx={{
            display: 'flex',
            gap: { xs: 2, md: 4 },
            mb: 2,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {filteredConsumers.map((consumer) => {
            const consumerLogoSrc = CONSUMER_LOGOS[consumer.id.toLowerCase()];

            return (
              <Box
                key={consumer.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                {consumerLogoSrc ? (
                  <Image
                    src={consumerLogoSrc}
                    alt={consumer.name}
                    width={28}
                    height={28}
                    style={{ objectFit: 'contain', borderRadius: 8 }}
                  />
                ) : (
                  <Box
                    aria-hidden='true'
                    sx={(theme) => ({
                      width: 28,
                      height: 28,
                      borderRadius: 2,
                      bgcolor: theme.palette.grey[200],
                      border: `1px solid ${theme.palette.divider}`,
                      flexShrink: 0,
                    })}
                  />
                )}
                <Typography variant='body1' fontWeight={700} fontSize={'1.25rem'}>
                  {consumer.name}
                </Typography>
              </Box>
            );
          })}
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <FilterAltIcon sx={{ verticalAlign: 'middle' }} />
          {CONSUMER_TYPES.map((type) => (
            <Chip
              key={type}
              size='small'
              label={type}
              color={selectedType === type ? 'primary' : 'default'}
              variant={selectedType === type ? 'filled' : 'outlined'}
              onClick={() => {
                setSelectedType(selectedType === type ? null : type);
              }}
            />
          ))}
        </Box>
        <Divider sx={{ my: 3 }} />
        <Box
          sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', mt: 3 }}
        >
          <Button
            variant='contained'
            size='small'
            href={CONTRIBUTE_URL}
            target='_blank'
            rel='noopener noreferrer'
            endIcon={<AddIcon></AddIcon>}
          >
            Add Consumer
          </Button>
          <Button
            variant='outlined'
            size='small'
            href='https://gtfs.org'
            target='_blank'
            rel='noopener noreferrer'
            endIcon={<OpenInNewIcon />}
          >
            gtfs.org
          </Button>
        </Box>

        {/* Category Sections */}
        {categories.map((category) => {
          const categoryFeatures = featuresByCategory[category] ?? [];
          const progress = computeCategoryProgress(
            categoryFeatures,
            filteredConsumers,
          );
          const expanded = isCategoryExpanded(category);

          return (
            <Paper
              key={category}
              elevation={1}
              sx={{ mb: 3, overflow: 'hidden', borderRadius: '6px' }}
            >
              {/* Category Header */}
              <Box
                onClick={() => {
                  toggleCategory(category);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  cursor: 'pointer',
                  backgroundColor: 'background.default',

                  px: 3,
                  py: 1.5,
                  userSelect: 'none',
                }}
              >
                <IconButton size='small' sx={{ color: 'inherit', p: 0 }}>
                  {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <Typography variant='h6' fontWeight={600}>
                  {category}
                </Typography>
                <Chip
                  label={`${categoryFeatures.length} feature${categoryFeatures.length !== 1 ? 's' : ''}`}
                  size='small'
                  sx={(theme) => ({
                    bgcolor: `rgba(${theme.vars.palette.common.onBackgroundChannel} / 0.1)`,
                  })}
                />
                <Box sx={{ flexGrow: 1 }} />
                <Tooltip
                  placement='top'
                  title='Adoption of this category across selected consumers'
                  arrow
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      minWidth: 200,
                    }}
                  >
                    <LinearProgress
                      variant='determinate'
                      value={progress}
                      color={'primary'}
                      sx={{
                        flexGrow: 1,
                        height: 8,
                        borderRadius: 4,
                      }}
                    />
                    <Typography variant='body2' fontWeight={600}>
                      {progress}%
                    </Typography>
                  </Box>
                </Tooltip>
              </Box>

              {/* Feature Table */}
              <Collapse in={expanded}>
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size='small'>
                    <TableHead>
                      <TableRow
                        sx={{
                          bgcolor: 'background.default',
                          borderTop: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <TableCell
                          sx={{
                            fontWeight: 600,
                            color: 'text.secondary',
                            fontSize: 12,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            minWidth: 210,
                            position: 'sticky',
                            left: 0,
                            zIndex: 10,
                            bgcolor: 'background.default',
                          }}
                        >
                          Feature
                        </TableCell>
                        {filteredConsumers.map((consumer) => (
                          <TableCell
                            key={consumer.id}
                            sx={{
                              minWidth: '150px',
                              width:
                                'calc(100% / ' + filteredConsumers.length + ')',
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0.25,
                              }}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                }}
                              >
                                <Image
                                  src={
                                    CONSUMER_LOGOS[consumer.id.toLowerCase()]
                                  }
                                  alt={consumer.name}
                                  width={32}
                                  height={32}
                                  style={{
                                    objectFit: 'contain',
                                    borderRadius: '4px',
                                  }}
                                />
                                <Typography variant='body2' fontWeight={600}>
                                  {consumer.name}
                                </Typography>
                              </Box>
                              {consumer.lastUpdate != null ? (
                                <Typography
                                  variant='caption'
                                  color='text.secondary'
                                >
                                  {`Updated ${formatDate(consumer.lastUpdate)}`}
                                </Typography>
                              ) : null}
                            </Box>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {categoryFeatures.map((feature) => (
                        <TableRow
                          key={feature.name}
                          sx={{
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            height: 72,
                            '&:hover .feature-links': {
                              opacity: 1,
                            },
                          }}
                        >
                          <TableCell
                            sx={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 10,
                              bgcolor: 'background.default',
                              verticalAlign: 'middle',
                              minWidth: 210,
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 1,
                              }}
                            >
                              <Typography
                                variant='body2'
                                fontWeight={600}
                                sx={{ maxWidth: '125px' }}
                              >
                                {feature.name}
                              </Typography>
                              <Box
                                className='feature-links'
                                sx={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'flex-start',
                                  flexShrink: 0,
                                  gap: 0,
                                  opacity: 0,
                                  transition: 'opacity 0.15s',
                                }}
                              >
                                {feature.documentationUrl != null ? (
                                  <Button
                                    component='a'
                                    href={feature.documentationUrl}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    variant='text'
                                    size='small'
                                    startIcon={
                                      <MenuBookIcon sx={{ fontSize: 13 }} />
                                    }
                                    sx={{
                                      color: 'text.secondary',
                                      minWidth: 0,
                                      px: 0.5,
                                    }}
                                  >
                                    Docs
                                  </Button>
                                ) : null}
                                {feature.category.toLowerCase() !== 'base' && (
                                  <Button
                                    component='a'
                                    href={`/feeds?features=${encodeURIComponent(feature.name)}`}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    variant='text'
                                    size='small'
                                    startIcon={
                                      <DatasetIcon sx={{ fontSize: 13 }} />
                                    }
                                    sx={{
                                      color: 'text.secondary',
                                      minWidth: 0,
                                      px: 0.5,
                                    }}
                                  >
                                    Feeds
                                  </Button>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          {filteredConsumers.map((consumer) => {
                            const support = feature.support[consumer.id] ?? {
                              rawStatus: '',
                              details: '',
                            };
                            const statusText = getStatusText(support.rawStatus);
                            return (
                              <TableCell
                                key={consumer.id}
                                sx={{
                                  verticalAlign: 'middle',
                                  backgroundColor: 'background.default',
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 0.5,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 0.5,
                                    }}
                                  >
                                    {getStatusIcon(support.rawStatus)}
                                    <Typography
                                      variant='body2'
                                      fontWeight={500}
                                    >
                                      {statusText}
                                    </Typography>
                                  </Box>
                                  {support.details != null &&
                                  support.details !== '' ? (
                                    <FeatureDetail
                                      text={support.details}
                                      knownFieldsSet={knownFieldsSet}
                                    />
                                  ) : null}
                                </Box>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
