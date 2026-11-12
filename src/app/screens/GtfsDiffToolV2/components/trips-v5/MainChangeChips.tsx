'use client';

import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  TextField,
} from '@mui/material';
import { Clear, Search } from '@mui/icons-material';
import React from 'react';
import { TRIP_CLASS_COLORS } from '../../lib/trips-utils';
import {
  MAIN_CHANGE_CLASS,
  MAIN_CHANGE_LABELS,
  type MainChangeCategory,
} from '../../lib/trips-v2-summary';
import {
  type DayRouteFilters,
  NO_DAY_FILTERS,
  isFiltering,
} from '../../lib/trips-v5-day-filter';

export function categoryColor(c: MainChangeCategory): string {
  return TRIP_CLASS_COLORS[MAIN_CHANGE_CLASS[c]];
}

/**
 * A route's main-change categories, styled like Routes v2's ChangeChips;
 * those selected in the filter bar filled, like their filter chip.
 */
export function MainChangeChips({
  categories,
  selected = [],
  size = 'small',
}: {
  categories: MainChangeCategory[];
  selected?: MainChangeCategory[];
  /** 'standard': the size of the report's summary chips (ToneChip). */
  size?: 'small' | 'standard';
}): React.ReactElement | null {
  const standard = size === 'standard';
  if (categories.length === 0) return null;
  return (
    <Box
      component='ul'
      aria-label='Change categories'
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: standard ? 1 : 0.5,
        m: 0,
        p: 0,
      }}
    >
      {categories.map((c) => {
        const color = categoryColor(c);
        const on = selected.includes(c);
        return (
          <Box
            component='li'
            key={c}
            sx={{
              listStyle: 'none',
              px: standard ? 1.25 : 0.75,
              py: standard ? 0.5 : 0,
              height: standard ? undefined : 18,
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: standard ? '4px' : '9px',
              fontSize: standard ? '0.78rem' : '0.68rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              border: '1px solid',
              borderColor: color,
              color: on ? '#fff' : color,
              bgcolor: on ? color : undefined,
            }}
          >
            {MAIN_CHANGE_LABELS[c]}
          </Box>
        );
      })}
    </Box>
  );
}

/** Search box plus one toggle chip per category present on the day. */
export function MainChangeFilterBar({
  counts,
  filters,
  onChange,
}: {
  counts: Array<{ category: MainChangeCategory; count: number }>;
  filters: DayRouteFilters;
  onChange: (f: DayRouteFilters) => void;
}): React.ReactElement {
  // Keep selected categories visible even on a day without them.
  const shown = [
    ...counts,
    ...filters.categories
      .filter((c) => !counts.some((x) => x.category === c))
      .map((c) => ({ category: c, count: 0 })),
  ];
  const toggle = (c: MainChangeCategory): void =>
    onChange({
      ...filters,
      categories: filters.categories.includes(c)
        ? filters.categories.filter((x) => x !== c)
        : [...filters.categories, c],
    });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
      <TextField
        size='small'
        placeholder='Search routes, headsigns or stops'
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        sx={{
          maxWidth: 420,
          '& .MuiOutlinedInput-root': { bgcolor: 'background.default' },
        }}
        slotProps={{
          htmlInput: { 'aria-label': 'Search routes' },
          input: {
            startAdornment: (
              <InputAdornment position='start'>
                <Search fontSize='small' />
              </InputAdornment>
            ),
            endAdornment: filters.search ? (
              <InputAdornment position='end'>
                <IconButton
                  size='small'
                  aria-label='Clear search'
                  onClick={() => onChange({ ...filters, search: '' })}
                >
                  <Clear fontSize='small' />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      {shown.length > 0 ? (
        <Box
          role='group'
          aria-label='Filter by change'
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          {shown.map(({ category: c, count }) => {
            const on = filters.categories.includes(c);
            const color = categoryColor(c);
            return (
              <Chip
                key={c}
                size='small'
                clickable
                variant={on ? 'filled' : 'outlined'}
                aria-pressed={on}
                label={`${MAIN_CHANGE_LABELS[c]} ${count.toLocaleString()}`}
                onClick={() => toggle(c)}
                sx={{
                  fontWeight: 600,
                  borderColor: color,
                  color: on ? '#fff' : color,
                  bgcolor: on ? color : undefined,
                  '&&:hover': { bgcolor: on ? color : undefined },
                }}
              />
            );
          })}
          {isFiltering(filters) ? (
            <Button
              size='small'
              onClick={() => onChange(NO_DAY_FILTERS)}
              sx={{ textTransform: 'none', ml: 0.5 }}
            >
              Clear filters
            </Button>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
