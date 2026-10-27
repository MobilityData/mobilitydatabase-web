'use client';

import { Box, Typography, useMediaQuery } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import type { SvgIconComponent } from '@mui/icons-material';
import {
  Accessible,
  AirportShuttle,
  AltRoute,
  BatteryChargingFull,
  CalendarMonth,
  CarRental,
  ConfirmationNumber,
  DepartureBoard,
  DirectionsBike,
  DirectionsBoat,
  DirectionsBus,
  DirectionsWalk,
  ElectricBike,
  ElectricCar,
  ElectricScooter,
  Elevator,
  EvStation,
  LocalParking,
  Map as MapIcon,
  Moped,
  PedalBike,
  PinDrop,
  Route,
  Schedule,
  Subway,
  Train,
  Tram,
  TransferWithinAStation,
} from '@mui/icons-material';
import React, { useEffect, useState } from 'react';

/**
 * GTFS (modes, stops, schedules, fares, pathways, flex) interleaved with
 * GBFS (bikes, scooters, mopeds, car share, docks, charging) so consecutive
 * frames alternate between the two specs.
 */
const ICONS: Array<{ Icon: SvgIconComponent; name: string }> = [
  { Icon: DirectionsBus, name: 'Bus' },
  { Icon: PedalBike, name: 'Bike share' },
  { Icon: Tram, name: 'Tram' },
  { Icon: ElectricScooter, name: 'E-scooter' },
  { Icon: PinDrop, name: 'Stop' },
  { Icon: LocalParking, name: 'Dock' },
  { Icon: Subway, name: 'Subway' },
  { Icon: ElectricBike, name: 'E-bike' },
  { Icon: Schedule, name: 'Schedule' },
  { Icon: EvStation, name: 'Charging station' },
  { Icon: Train, name: 'Rail' },
  { Icon: Moped, name: 'Moped' },
  { Icon: CalendarMonth, name: 'Service Dates' },
  { Icon: BatteryChargingFull, name: 'Vehicle range' },
  { Icon: Route, name: 'Route' },
  { Icon: DirectionsBike, name: 'Bike' },
  { Icon: DirectionsBoat, name: 'Ferry' },
  { Icon: CarRental, name: 'Car share' },
  { Icon: DepartureBoard, name: 'Departures' },
  { Icon: ElectricCar, name: 'Electric car' },
  { Icon: ConfirmationNumber, name: 'Fares' },
  { Icon: MapIcon, name: 'Geofencing zones' },
  { Icon: Elevator, name: 'Pathways' },
  { Icon: AltRoute, name: 'Shapes' },
  { Icon: Accessible, name: 'Accessibility' },
  { Icon: TransferWithinAStation, name: 'Transfers' },
  { Icon: AirportShuttle, name: 'Demand-responsive' },
  { Icon: DirectionsWalk, name: 'Walk' },
];

const FRAME_MS = 650;
const REDUCED_MOTION_FRAME_MS = 2000;

const popIn = keyframes`
  0%   { opacity: 0; transform: translateY(10px) scale(0.6) rotate(-12deg); }
  60%  { opacity: 1; transform: translateY(-2px) scale(1.08) rotate(3deg); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
`;

const pulse = keyframes`
  0%   { box-shadow: 0 0 0 0 var(--loader-ring); }
  100% { box-shadow: 0 0 0 14px transparent; }
`;

const travel = keyframes`
  0%   { left: 0%; }
  100% { left: 100%; }
`;

interface TransitLoaderProps {
  /** Text announced to screen readers and shown under the animation. */
  label: string;
  /** Diameter of the icon badge in px. */
  size?: number;
}

/** Loading indicator for the GTFS change tracker: cycles through transit and micromobility icons. */
export default function TransitLoader({
  label,
  size = 56,
}: TransitLoaderProps): React.ReactElement {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % ICONS.length),
      reducedMotion ? REDUCED_MOTION_FRAME_MS : FRAME_MS,
    );
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  const { Icon, name } = ICONS[index];
  const lineWidth = size * 2.2;

  return (
    <Box
      role='status'
      aria-live='polite'
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5,
        py: 6,
      }}
    >
      <Box
        aria-hidden
        title={name}
        sx={(theme) => ({
          '--loader-ring': theme.vars
            ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.35)`
            : 'rgba(25,118,210,.35)',
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          animation: reducedMotion
            ? undefined
            : `${pulse} ${FRAME_MS}ms ease-out infinite`,
        })}
      >
        {/* Keyed so each frame remounts and replays the pop-in animation. */}
        <Icon
          key={index}
          sx={{
            fontSize: size * 0.55,
            animation: reducedMotion
              ? undefined
              : `${popIn} ${FRAME_MS * 0.6}ms cubic-bezier(.2,.8,.3,1.2) both`,
          }}
        />
      </Box>

      {/* A short route line with three stops and a vehicle travelling along it. */}
      <Box
        aria-hidden
        sx={{ position: 'relative', width: lineWidth, height: 10 }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 4,
            left: 0,
            right: 0,
            height: 2,
            borderRadius: 1,
            bgcolor: 'divider',
          }}
        />
        {[0, 50, 100].map((pct) => (
          <Box
            key={pct}
            sx={{
              position: 'absolute',
              top: 1,
              left: `${pct}%`,
              width: 8,
              height: 8,
              ml: '-4px',
              borderRadius: '50%',
              bgcolor: 'background.paper',
              border: '2px solid',
              borderColor: 'text.disabled',
            }}
          />
        ))}
        {!reducedMotion && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              width: 10,
              height: 10,
              ml: '-5px',
              borderRadius: '50%',
              bgcolor: 'primary.main',
              animation: `${travel} ${FRAME_MS * 4}ms ease-in-out infinite alternate`,
            }}
          />
        )}
      </Box>

      <Typography color='text.secondary' variant='body2'>
        {label}
      </Typography>
    </Box>
  );
}
