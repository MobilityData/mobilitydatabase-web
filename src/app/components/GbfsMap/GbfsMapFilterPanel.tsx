'use client';

import React from 'react';
import {
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Divider,
  IconButton,
  useTheme,
} from '@mui/material';
import { FilterList, Close as CloseIcon } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import {
  STATION_COLORS,
  VEHICLE_FORM_FACTOR_COLORS,
} from '../GbfsVisualizationMap.layers';

// ─── Filter State Types ──────────────────────────────────────────────────────

export interface GbfsMapFilters {
  showStations: boolean;
  showVirtualStations: boolean;
  showPhysicalStations: boolean;
  showVehicles: boolean;
  vehicleFormFactors: Record<string, boolean>;
  showGeofencing: boolean;
  showErrors: boolean;
}

export const defaultFilters: GbfsMapFilters = {
  showStations: true,
  showVirtualStations: true,
  showPhysicalStations: true,
  showVehicles: true,
  vehicleFormFactors: {
    bicycle: true,
    scooter: true,
    car: true,
    moped: true,
    cargo_bicycle: true,
    other: true,
  },
  showGeofencing: true,
  showErrors: true,
};

// ─── Component ───────────────────────────────────────────────────────────────

interface GbfsMapFilterPanelProps {
  filters: GbfsMapFilters;
  onFiltersChange: (filters: GbfsMapFilters) => void;
  availableFormFactors: string[];
  hasStations: boolean;
  hasPhysicalStations: boolean;
  hasVirtualStations: boolean;
  hasVehicles: boolean;
  hasGeofencing: boolean;
  hasErrors: boolean;
  onClose: () => void;
}

export function GbfsMapFilterPanel({
  filters,
  onFiltersChange,
  availableFormFactors,
  hasStations,
  hasPhysicalStations,
  hasVirtualStations,
  hasVehicles,
  hasGeofencing,
  hasErrors,
  onClose,
}: GbfsMapFilterPanelProps): React.ReactElement {
  const t = useTranslations('gbfsMap');
  const theme = useTheme();

  const update = (partial: Partial<GbfsMapFilters>): void => {
    onFiltersChange({ ...filters, ...partial });
  };

  return (
    <Box
      sx={{
        width: { xs: '100%', md: '260px' },
        p: 2,
        backgroundColor: theme.vars.palette.background.paper,
        borderRadius: 1,
        overflowY: 'auto',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <FilterList fontSize='small' />
          <Typography variant='subtitle2' fontWeight={700}>
            {t('filters')}
          </Typography>
        </Box>
        <IconButton
          size='small'
          onClick={onClose}
          sx={{ display: { md: 'none' } }}
        >
          <CloseIcon fontSize='small' />
        </IconButton>
      </Box>

      {/* Stations */}
      {hasStations && (
        <>
          <Typography
            variant='caption'
            fontWeight={700}
            color='text.secondary'
            sx={{ mt: 1 }}
          >
            {t('stations')}
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  size='small'
                  checked={filters.showStations}
                  onChange={(e) => {
                    update({ showStations: e.target.checked });
                  }}
                />
              }
              label={
                <Typography variant='caption'>{t('showStations')}</Typography>
              }
            />
            {filters.showStations && (hasPhysicalStations || hasVirtualStations) && (
              <Box sx={{ pl: 2 }}>
                {hasPhysicalStations && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size='small'
                        checked={filters.showPhysicalStations}
                        onChange={(e) => {
                          update({ showPhysicalStations: e.target.checked });
                        }}
                      />
                    }
                    label={
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: STATION_COLORS.physical,
                          }}
                        />
                        <Typography variant='caption'>
                          {t('physicalStation')}
                        </Typography>
                      </Box>
                    }
                  />
                )}
                {hasVirtualStations && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size='small'
                        checked={filters.showVirtualStations}
                        onChange={(e) => {
                          update({ showVirtualStations: e.target.checked });
                        }}
                      />
                    }
                    label={
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: STATION_COLORS.virtual,
                          }}
                        />
                        <Typography variant='caption'>
                          {t('virtualStation')}
                        </Typography>
                      </Box>
                    }
                  />
                )}
              </Box>
            )}
          </FormGroup>
          <Divider sx={{ my: 1 }} />
        </>
      )}

      {/* Vehicles */}
      {hasVehicles && (
        <>
          <Typography variant='caption' fontWeight={700} color='text.secondary'>
            {t('vehicles')}
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  size='small'
                  checked={filters.showVehicles}
                  onChange={(e) => {
                    update({ showVehicles: e.target.checked });
                  }}
                />
              }
              label={
                <Typography variant='caption'>{t('showVehicles')}</Typography>
              }
            />
            {filters.showVehicles && (
              <Box sx={{ pl: 2 }}>
                {availableFormFactors.map((ff) => (
                  <FormControlLabel
                    key={ff}
                    control={
                      <Checkbox
                        size='small'
                        checked={filters.vehicleFormFactors[ff]}
                        onChange={(e) => {
                          update({
                            vehicleFormFactors: {
                              ...filters.vehicleFormFactors,
                              [ff]: e.target.checked,
                            },
                          });
                        }}
                      />
                    }
                    label={
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor:
                              VEHICLE_FORM_FACTOR_COLORS[ff] ??
                              VEHICLE_FORM_FACTOR_COLORS.other,
                          }}
                        />
                        <Typography
                          variant='caption'
                          sx={{ textTransform: 'capitalize' }}
                        >
                          {ff.replace(/_/g, ' ')}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </Box>
            )}
          </FormGroup>
          <Divider sx={{ my: 1 }} />
        </>
      )}

      {/* Geofencing */}
      {hasGeofencing && (
        <>
          <Typography variant='caption' fontWeight={700} color='text.secondary'>
            {t('geofencing')}
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  size='small'
                  checked={filters.showGeofencing}
                  onChange={(e) => {
                    update({ showGeofencing: e.target.checked });
                  }}
                />
              }
              label={
                <Typography variant='caption'>{t('showGeofencing')}</Typography>
              }
            />
          </FormGroup>
          <Divider sx={{ my: 1 }} />
        </>
      )}

      {/* Errors */}
      {hasErrors && (
        <>
          <Typography variant='caption' fontWeight={700} color='text.secondary'>
            {t('validationErrors')}
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  size='small'
                  checked={filters.showErrors}
                  onChange={(e) => {
                    update({ showErrors: e.target.checked });
                  }}
                />
              }
              label={
                <Typography variant='caption'>{t('showErrors')}</Typography>
              }
            />
          </FormGroup>
        </>
      )}
    </Box>
  );
}
