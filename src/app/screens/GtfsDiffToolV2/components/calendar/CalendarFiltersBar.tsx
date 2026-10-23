'use client';

import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import React from 'react';
import type { RouteInfo } from '../../lib/entity-diff-types';
import {
  CHANGE_COLORS,
  CHANGE_KINDS,
  CHANGE_LABELS,
  type CalendarFilters,
  type ChangeKind,
  DEFAULT_FILTERS,
  type ExceptionFilter,
  isFiltered,
} from '../../lib/calendar-utils';
import { MONO_FONT, RouteChip } from './shared';

interface CalendarFiltersBarProps {
  filters: CalendarFilters;
  onChange: (filters: CalendarFilters) => void;
  /** Number of service-day changes per kind under the other filters. */
  kindCounts: Record<ChangeKind, number>;
  routes: Record<string, RouteInfo>;
  routeIds: string[];
  serviceIds: string[];
}

export default function CalendarFiltersBar({
  filters,
  onChange,
  kindCounts,
  routes,
  routeIds,
  serviceIds,
}: CalendarFiltersBarProps): React.ReactElement {
  const toggleKind = (k: ChangeKind): void => {
    const kinds = filters.kinds.includes(k)
      ? filters.kinds.filter((x) => x !== k)
      : CHANGE_KINDS.filter((x) => x === k || filters.kinds.includes(x));
    onChange({ ...filters, kinds });
  };

  const routeLabel = (id: string): string => {
    const r = routes[id];
    return r ? `${r.short_name || id} · ${r.long_name}` : id;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        alignItems: 'center',
        mb: 2,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1 }}>
        {CHANGE_KINDS.map((k) => {
          const active = filters.kinds.includes(k);
          const color = CHANGE_COLORS[k];
          return (
            <Chip
              key={k}
              label={`${CHANGE_LABELS[k]} · ${kindCounts[k].toLocaleString()}`}
              onClick={() => toggleKind(k)}
              icon={
                <Box
                  component='span'
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '2px',
                    bgcolor: active ? '#fff' : color,
                    ml: '8px !important',
                  }}
                />
              }
              sx={{
                bgcolor: active ? color : 'transparent',
                color: active ? '#fff' : color,
                border: `1px solid ${color}`,
                fontWeight: 700,
                '&:hover': {
                  bgcolor: active ? color : 'transparent',
                  opacity: 0.85,
                },
              }}
            />
          );
        })}
      </Box>

      <Autocomplete
        multiple
        size='small'
        options={routeIds}
        value={filters.routeIds}
        onChange={(_, value) => onChange({ ...filters, routeIds: value })}
        getOptionLabel={routeLabel}
        renderOption={(props, id) => {
          const { key, ...rest } =
            props as React.HTMLAttributes<HTMLLIElement> & { key: string };
          return (
            <li key={key} {...rest}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <RouteChip routeId={id} route={routes[id]} linked={false} />
                <span>{routes[id]?.long_name}</span>
              </Box>
            </li>
          );
        }}
        renderValue={(value, getItemProps) =>
          value.map((id, index) => {
            const { key, ...itemProps } = getItemProps({ index });
            return (
              <Chip
                key={key}
                size='small'
                label={routes[id]?.short_name || id}
                {...itemProps}
              />
            );
          })
        }
        renderInput={(params) => (
          <TextField {...params} label='Line' placeholder='Route' />
        )}
        sx={{ minWidth: 220, flex: '1 1 220px' }}
      />

      <Autocomplete
        multiple
        size='small'
        options={serviceIds}
        value={filters.serviceIds}
        onChange={(_, value) => onChange({ ...filters, serviceIds: value })}
        renderInput={(params) => (
          <TextField {...params} label='Service ID' placeholder='service_id' />
        )}
        slotProps={{
          listbox: { sx: { fontFamily: MONO_FONT, fontSize: '0.8rem' } },
        }}
        sx={{ minWidth: 220, flex: '1 1 220px' }}
      />

      <FormControl size='small' sx={{ minWidth: 200 }}>
        <InputLabel id='exception-filter-label'>Exception type</InputLabel>
        <Select
          labelId='exception-filter-label'
          label='Exception type'
          value={filters.exceptionType}
          onChange={(e) =>
            onChange({
              ...filters,
              exceptionType: e.target.value as ExceptionFilter,
            })
          }
        >
          <MenuItem value='all'>All changes</MenuItem>
          <MenuItem value='1'>Type 1 · service added</MenuItem>
          <MenuItem value='2'>Type 2 · service removed</MenuItem>
          <MenuItem value='none'>Regular calendar only</MenuItem>
        </Select>
      </FormControl>

      {isFiltered(filters) && (
        <Button size='small' onClick={() => onChange(DEFAULT_FILTERS)}>
          Clear filters
        </Button>
      )}
    </Box>
  );
}
