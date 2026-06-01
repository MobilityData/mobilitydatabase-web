'use client';

import React, { useState } from 'react';
import { Popup } from 'react-map-gl/maplibre';
import {
  Box,
  Typography,
  Chip,
  Divider,
  IconButton,
  Collapse,
  Button,
  Tab,
  Tabs,
  useTheme,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  LocationOn,
  PedalBike,
  ElectricScooter,
  DirectionsCar,
  TwoWheeler,
  LocalParking,
  Block,
  CheckCircleOutline,
  WarningAmber,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import type { GbfsPricingPlan } from '../../services/gbfs/gbfs-feed-types';
import type { GbfsPopupData, GbfsPopupItem, MapErrorDetails } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────────────────

export type { GbfsPopupData, GbfsPopupItem } from './types';

interface GbfsMapPopupProps {
  popupData: GbfsPopupData;
  pricingPlans: GbfsPricingPlan[];
  onClose: () => void;
  onViewError?: (details: MapErrorDetails) => void;
}

// ─── Main Popup Component ────────────────────────────────────────────────────

export function GbfsMapPopup({
  popupData,
  pricingPlans,
  onClose,
  onViewError,
}: GbfsMapPopupProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);
  const t = useTranslations('gbfsMap');
  const { items } = popupData;
  const activeItem = items[Math.min(activeTab, items.length - 1)];

  const tabLabels: Record<GbfsPopupItem['type'], string> = {
    station: t('tabStation'),
    vehicle: t('tabVehicle'),
    geofencing: t('tabZone'),
    error: t('tabError'),
  };

  return (
    <Popup
      longitude={popupData.longitude}
      latitude={popupData.latitude}
      anchor='bottom'
      onClose={onClose}
      closeOnClick={false}
      maxWidth='320px'
    >
      {items.length > 1 && (
        <Tabs
          value={activeTab}
          onChange={(_, v) => {
            setActiveTab(v as number);
          }}
          variant='scrollable'
          scrollButtons='auto'
          sx={{
            minHeight: 32,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: 32,
              py: 0.5,
              fontSize: '0.75rem',
              minWidth: 'auto',
              px: 1.5,
            },
          }}
        >
          {items.map((item, idx) => (
            <Tab
              key={idx}
              icon={getTabIcon(item.type)}
              iconPosition='start'
              label={tabLabels[item.type]}
              value={idx}
            />
          ))}
        </Tabs>
      )}
      <Box sx={{ maxHeight: '400px', overflowY: 'auto', p: 0.5 }}>
        {activeItem.type === 'station' && (
          <StationPopupContent properties={activeItem.properties} />
        )}
        {activeItem.type === 'vehicle' && (
          <VehiclePopupContent
            properties={activeItem.properties}
            pricingPlans={pricingPlans}
          />
        )}
        {activeItem.type === 'geofencing' && (
          <GeofencingPopupContent
            properties={activeItem.properties}
            overlappingZones={activeItem.overlappingZones}
          />
        )}
        {activeItem.type === 'error' && (
          <ErrorPopupContent
            properties={activeItem.properties}
            onViewError={onViewError}
          />
        )}
        {activeItem.type !== 'geofencing' && (
          <RawDataSection properties={activeItem.properties} />
        )}
      </Box>
    </Popup>
  );
}

function getTabIcon(type: GbfsPopupItem['type']): React.ReactElement {
  const sx = { fontSize: 14 };
  switch (type) {
    case 'station':
      return <LocalParking sx={sx} />;
    case 'vehicle':
      return <PedalBike sx={sx} />;
    case 'geofencing':
      return <LocationOn sx={sx} />;
    case 'error':
      return <WarningAmber sx={sx} />;
  }
}

// ─── Station Popup ───────────────────────────────────────────────────────────

function StationPopupContent({
  properties,
}: {
  properties: Record<string, unknown>;
}): React.ReactElement {
  const t = useTranslations('gbfsMap');
  const isVirtual = properties.is_virtual === true;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <LocalParking fontSize='small' color='primary' />
        <Typography variant='subtitle2' fontWeight={700}>
          {String(properties.name ?? t('unknownStation'))}
        </Typography>
      </Box>

      <Chip
        size='small'
        label={isVirtual ? t('virtualStation') : t('physicalStation')}
        color={isVirtual ? 'secondary' : 'primary'}
        variant='outlined'
        sx={{ mb: 1 }}
      />

      {properties.address != null && String(properties.address) !== '' && (
        <Typography variant='caption' display='block' color='text.secondary'>
          {String(properties.address)}
        </Typography>
      )}

      <Divider sx={{ my: 1 }} />

      {(properties.bikes_available != null ||
        properties.docks_available != null ||
        properties.capacity != null) && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
          {properties.bikes_available != null && (
            <InfoRow
              label={t('bikesAvailable')}
              value={properties.bikes_available}
            />
          )}
          {properties.docks_available != null && (
            <InfoRow
              label={t('docksAvailable')}
              value={properties.docks_available}
            />
          )}
          {properties.capacity != null && (
            <InfoRow label={t('capacity')} value={properties.capacity} />
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        <StatusChip
          active={properties.is_renting === true}
          label={t('renting')}
        />
        <StatusChip
          active={properties.is_returning === true}
          label={t('returning')}
        />
        <StatusChip
          active={properties.is_installed === true}
          label={t('installed')}
        />
      </Box>
    </Box>
  );
}

// ─── Vehicle Popup ───────────────────────────────────────────────────────────

function VehiclePopupContent({
  properties,
  pricingPlans,
}: {
  properties: Record<string, unknown>;
  pricingPlans: GbfsPricingPlan[];
}): React.ReactElement {
  const t = useTranslations('gbfsMap');
  const formFactor = String(properties.form_factor ?? 'other');
  const pricingPlanId = String(properties.pricing_plan_id ?? '');
  const plan = pricingPlans.find((p) => p.plan_id === pricingPlanId);
  const battery = Number(properties.battery ?? -1);
  const range = Number(properties.range_meters ?? -1);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {getVehicleIcon(formFactor)}
        <Typography variant='subtitle2' fontWeight={700}>
          {String(
            properties.vehicle_type_name != null &&
              String(properties.vehicle_type_name) !== ''
              ? properties.vehicle_type_name
              : t('vehicle'),
          )}
        </Typography>
      </Box>

      <Chip
        size='small'
        label={formFactor}
        sx={{ mb: 1, textTransform: 'capitalize' }}
      />

      <Divider sx={{ my: 1 }} />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
        {battery >= 0 && (
          <InfoRow
            label={t('battery')}
            value={`${Math.round(battery * 100)}%`}
          />
        )}
        {range >= 0 && (
          <InfoRow
            label={t('range')}
            value={`${(range / 1000).toFixed(1)} km`}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
        {properties.is_reserved === true && (
          <Chip size='small' label={t('reserved')} color='warning' />
        )}
        {properties.is_disabled === true && (
          <Chip size='small' label={t('disabled')} color='error' />
        )}
        {properties.is_reserved !== true && properties.is_disabled !== true && (
          <Chip size='small' label={t('available')} color='success' />
        )}
      </Box>

      {plan != null && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography variant='caption' fontWeight={600}>
            {t('pricingPlan')}
          </Typography>
          <Typography variant='caption' display='block'>
            {plan.name} — {plan.currency} {plan.price}
          </Typography>
          {plan.description != null && (
            <Typography variant='caption' color='text.secondary'>
              {plan.description}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

// ─── Geofencing Popup ────────────────────────────────────────────────────────

function GeofencingPopupContent({
  properties,
  overlappingZones,
}: {
  properties: Record<string, unknown>;
  overlappingZones?: Array<Record<string, unknown>>;
}): React.ReactElement {
  const t = useTranslations('gbfsMap');
  const allZones = overlappingZones ?? [properties];

  return (
    <Box>
      {allZones.length > 1 && (
        <Typography variant='subtitle2' fontWeight={700} mb={0.5}>
          {allZones.length} {t('overlappingZones')}
        </Typography>
      )}

      {allZones.map((zone, zoneIdx) => {
        const name = String(zone.name ?? t('geofencingZone'));
        const rules = parseRules(zone);

        return (
          <Box key={zoneIdx}>
            {zoneIdx > 0 && <Divider sx={{ my: 1 }} />}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
              <Typography variant='subtitle2' fontWeight={700}>
                {name}
              </Typography>
              {allZones.length > 1 && zoneIdx === 0 && (
                <Chip
                  size='small'
                  label={t('highestPrecedence')}
                  color='primary'
                  variant='outlined'
                  sx={{ height: 18, fontSize: '0.65rem' }}
                />
              )}
            </Box>

            {allZones.length === 1 && (
              <Typography
                variant='caption'
                color='text.secondary'
                mb={1}
                display='block'
              >
                {t('geofencingZone')}
              </Typography>
            )}

            {rules.length > 0 ? (
              rules.map((rule, i) => (
                <Box key={i} sx={{ mb: 0.5 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                    }}
                  >
                    <RuleRow
                      label={t('rideStart')}
                      allowed={rule.ride_start_allowed}
                    />
                    <RuleRow
                      label={t('rideEnd')}
                      allowed={rule.ride_end_allowed}
                    />
                    <RuleRow
                      label={t('rideThrough')}
                      allowed={rule.ride_through_allowed}
                    />
                    {rule.station_parking === true && (
                      <RuleRow label={t('stationParking')} allowed={true} />
                    )}
                  </Box>
                </Box>
              ))
            ) : (
              <Typography variant='caption' color='text.secondary'>
                {t('noRules')}
              </Typography>
            )}

            <RawDataSection properties={zone} />
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Error Popup ─────────────────────────────────────────────────────────────

function ErrorPopupContent({
  properties,
  onViewError,
}: {
  properties: Record<string, unknown>;
  onViewError?: (details: MapErrorDetails) => void;
}): React.ReactElement {
  const t = useTranslations('gbfsMap');
  const errors = parseErrorList(properties);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <WarningAmber color='error' fontSize='small' />
        <Typography variant='subtitle2' fontWeight={700} color='error'>
          {t('validationErrors')} ({errors.length})
        </Typography>
      </Box>

      <Divider sx={{ my: 1 }} />

      {errors.map((err, i) => (
        <Box key={i} sx={{ mb: 0.5 }}>
          <Typography variant='caption' fontWeight={600}>
            {err.keyword}
          </Typography>
          <Typography variant='caption' display='block' color='text.secondary'>
            {err.message}
          </Typography>
          <Typography
            variant='caption'
            display='block'
            sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
          >
            {err.instancePath}
          </Typography>
          {onViewError != null && err.fileName !== '' && (
            <Button
              size='small'
              variant='text'
              color='error'
              startIcon={<VisibilityIcon sx={{ fontSize: 14 }} />}
              onClick={() => {
                onViewError({
                  fileName: err.fileName,
                  fileUrl: err.fileUrl !== '' ? err.fileUrl : undefined,
                  error: {
                    keyword: err.keyword,
                    message: err.message,
                    instancePath: err.instancePath,
                  },
                });
              }}
              sx={{ mt: 0.25, p: 0, minWidth: 0, fontSize: '0.7rem' }}
            >
              {t('viewError')}
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
}

// ─── Raw Data Section ────────────────────────────────────────────────────────

function RawDataSection({
  properties,
}: {
  properties: Record<string, unknown>;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations('gbfsMap');
  const theme = useTheme();

  const rawStr = String(properties._raw ?? '{}');
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawStr);
  } catch {
    rawJson = rawStr;
  }

  return (
    <Box sx={{ mt: 1 }}>
      <Divider sx={{ mb: 0.5 }} />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => {
          setExpanded((prev) => !prev);
        }}
      >
        <Typography variant='caption' fontWeight={600}>
          {t('viewRawData')}
        </Typography>
        <IconButton size='small'>
          {expanded ? (
            <ExpandLessIcon fontSize='small' />
          ) : (
            <ExpandMoreIcon fontSize='small' />
          )}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box
          component='pre'
          sx={{
            fontSize: '0.65rem',
            maxHeight: '200px',
            overflow: 'auto',
            p: 1,
            borderRadius: 1,
            backgroundColor: theme.vars.palette.action.hover,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {JSON.stringify(rawJson, null, 2)}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: unknown;
}): React.ReactElement {
  return (
    <Box>
      <Typography variant='caption' color='text.secondary'>
        {label}
      </Typography>
      <Typography variant='body2' fontWeight={600}>
        {String(value ?? '—')}
      </Typography>
    </Box>
  );
}

function StatusChip({
  active,
  label,
}: {
  active: boolean;
  label: string;
}): React.ReactElement {
  return (
    <Chip
      size='small'
      icon={active ? <CheckCircleOutline /> : <Block />}
      label={label}
      color={active ? 'success' : 'default'}
      variant='outlined'
    />
  );
}

function RuleRow({
  label,
  allowed,
}: {
  label: string;
  allowed: boolean;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {allowed ? (
        <CheckCircleOutline sx={{ fontSize: 14, color: 'success.main' }} />
      ) : (
        <Block sx={{ fontSize: 14, color: 'error.main' }} />
      )}
      <Typography variant='caption'>{label}</Typography>
    </Box>
  );
}

function getVehicleIcon(formFactor: string): React.ReactElement {
  switch (formFactor) {
    case 'bicycle':
    case 'cargo_bicycle':
      return <PedalBike fontSize='small' color='success' />;
    case 'scooter':
      return <ElectricScooter fontSize='small' sx={{ color: '#ff9800' }} />;
    case 'car':
      return <DirectionsCar fontSize='small' color='error' />;
    case 'moped':
      return <TwoWheeler fontSize='small' sx={{ color: '#ffeb3b' }} />;
    default:
      return <PedalBike fontSize='small' color='disabled' />;
  }
}

// ─── Property Parsers ────────────────────────────────────────────────────────

interface ParsedRule {
  ride_start_allowed: boolean;
  ride_end_allowed: boolean;
  ride_through_allowed: boolean;
  station_parking?: boolean;
}

function parseRules(properties: Record<string, unknown>): ParsedRule[] {
  // Rules may be stored as JSON string or directly
  if (typeof properties._rules === 'string') {
    try {
      return JSON.parse(properties._rules) as ParsedRule[];
    } catch {
      return [];
    }
  }

  // Flat properties from geofencing feature
  return [
    {
      ride_start_allowed: properties.ride_start_allowed !== false,
      ride_end_allowed: properties.ride_end_allowed !== false,
      ride_through_allowed: properties.ride_through_allowed !== false,
      station_parking: properties.station_parking === true ? true : undefined,
    },
  ];
}

interface ParsedError {
  keyword: string;
  message: string;
  instancePath: string;
  fileName: string;
  fileUrl: string;
}

function parseErrorList(properties: Record<string, unknown>): ParsedError[] {
  if (typeof properties._errors === 'string') {
    try {
      return JSON.parse(properties._errors) as ParsedError[];
    } catch {
      return [];
    }
  }
  return [];
}
