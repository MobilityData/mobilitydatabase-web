'use client';

import {
  Box,
  Button,
  Checkbox,
  Chip,
  Fab,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  type SxProps,
  type Theme,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CenterFocusStrong,
  FilterAlt,
  Fullscreen,
  FullscreenExit,
  TableRows,
} from '@mui/icons-material';
import React, { useCallback, useEffect, useState } from 'react';
import {
  StyledChipFilterContainer,
  StyledMapControlPanel,
} from '../../../Feed/Map.styles';

/**
 * Building blocks of an entity page with a diff map (stops, routes), laid out
 * like the feed detail map: a filter panel on the left, the map on the right,
 * active filters as chips in the report's actions row.
 */

/** Anchor of the raw file diff at the bottom of an entity page. */
export const RAW_DIFF_ID = 'raw-diff';

/** Map-marker style dot (also usable as a Chip icon, hence className). */
export function ColorDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}): React.ReactElement {
  return (
    <Box
      component='span'
      className={className}
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        bgcolor: color,
        border: '2px solid #fff',
        boxShadow: `0 0 0 1px ${color}`,
        flex: '0 0 auto',
      }}
    />
  );
}

export interface ColorOption<K extends string> {
  key: K;
  label: string;
  color: string;
  count: number;
}

/**
 * Checkboxes drawn in the map colours, styled like NestedCheckboxList.
 * Nothing selected is meant to show everything.
 */
export function ColorCheckboxList<K extends string>({
  options,
  selected,
  onToggle,
}: {
  options: Array<ColorOption<K>>;
  selected: K[];
  onToggle: (key: K) => void;
}): React.ReactElement {
  return (
    <List sx={{ width: '100%' }} dense>
      {options.map((o) => {
        const labelId = `color-option-${o.key}`;
        return (
          <ListItem key={o.key} disablePadding>
            <ListItemButton dense sx={{ p: 0 }} onClick={() => onToggle(o.key)}>
              <Checkbox
                edge='start'
                tabIndex={-1}
                disableRipple
                checked={selected.includes(o.key)}
                slotProps={{ input: { 'aria-labelledby': labelId } }}
                sx={{ color: o.color, '&.Mui-checked': { color: o.color } }}
              />
              <ListItemText
                id={labelId}
                primary={
                  <Box
                    component='span'
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <ColorDot color={o.color} />
                    <b>{o.label}</b>
                    <Box component='span' sx={{ color: 'text.secondary' }}>
                      ({o.count.toLocaleString()})
                    </Box>
                  </Box>
                }
                slotProps={{ primary: { variant: 'body1' } }}
              />
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}

export interface ActiveFilter {
  key: string;
  label: string;
  /** Colour dot shown in the chip (e.g. a change type). */
  color?: string;
  clear: () => void;
}

/** Removable chips for the active filters, plus "Clear all" (feed map style). */
export function ActiveFilterChips({
  filters,
  onClearAll,
  sx,
}: {
  filters: ActiveFilter[];
  onClearAll: () => void;
  sx?: SxProps<Theme>;
}): React.ReactElement {
  return (
    <StyledChipFilterContainer sx={sx}>
      {filters.length > 0 ? (
        <Button variant='text' size='small' onClick={onClearAll}>
          Clear all
        </Button>
      ) : null}
      {filters.map((f) => (
        <Chip
          key={f.key}
          color='primary'
          variant='outlined'
          size='small'
          label={f.label}
          icon={f.color ? <ColorDot color={f.color} /> : undefined}
          onDelete={f.clear}
          sx={{ cursor: 'pointer', '& .MuiChip-icon': { ml: 0.75 } }}
        />
      ))}
    </StyledChipFilterContainer>
  );
}

/** Desktop placement of ActiveFilterChips next to the actions-row CTA. */
export const INLINE_CHIPS_SX: SxProps<Theme> = {
  minHeight: 0,
  py: 0,
  flex: 1,
  alignSelf: 'center',
  display: { xs: 'none', md: 'flex' },
};

/** Scrolls to the raw file diff at the bottom of the page. */
export function SeeRawDiffButton(): React.ReactElement {
  return (
    <Button
      disableElevation
      variant='contained'
      endIcon={<TableRows />}
      sx={{ flexShrink: 0, alignSelf: 'center' }}
      onClick={() =>
        document
          .getElementById(RAW_DIFF_ID)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    >
      See Raw Diff
    </Button>
  );
}

/**
 * Left filter panel: 300px beside the map on desktop, a full-screen sheet on
 * mobile (opened from the map's filter button).
 */
export function DiffMapControlPanel({
  open,
  onClose,
  mobileChips,
  children,
}: React.PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  /** Active filters, shown at the top of the mobile sheet. */
  mobileChips: React.ReactNode;
}>): React.ReactElement {
  return (
    <StyledMapControlPanel
      showMapControlMobile={open}
      sx={{ m: { md: '0 16px 0 0' } }}
    >
      <Box
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          p: 1,
          zIndex: 1,
          bgcolor: 'background.paper',
        }}
      >
        <Button size='large' color='inherit' onClick={onClose}>
          Close
        </Button>
        {mobileChips}
      </Box>
      {children}
      <Box
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'sticky',
          bottom: '10px',
          mt: 1,
        }}
      >
        <Button variant='contained' fullWidth onClick={onClose}>
          Back to map
        </Button>
      </Box>
    </StyledMapControlPanel>
  );
}

/** The map's frame: primary border, recenter button, mobile filter button. */
export const DiffMapFrame = React.forwardRef<
  HTMLDivElement,
  React.PropsWithChildren<{
    onRecenter: () => void;
    onOpenFilters: () => void;
    recenterLabel: string;
    /** Full-screen state of the surrounding DiffMapLayout. */
    fullscreen?: boolean;
    onToggleFullscreen?: () => void;
  }>
>(function DiffMapFrame(
  {
    onRecenter,
    onOpenFilters,
    recenterLabel,
    fullscreen = false,
    onToggleFullscreen,
    children,
  },
  ref,
) {
  // Buttons sit left of the map's zoom control, right to left.
  const slot = (i: number): number => 60 + i * 50;
  return (
    <Box
      ref={ref}
      sx={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        height: fullscreen ? 'auto' : { xs: 480, md: 'auto' },
        borderRadius: '6px',
        border: '2px solid',
        borderColor: 'primary.main',
        overflow: 'hidden',
        scrollMarginTop: 96,
      }}
    >
      {onToggleFullscreen ? (
        <Tooltip title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}>
          <Fab
            size='small'
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            aria-pressed={fullscreen}
            sx={{ position: 'absolute', top: 10, right: slot(0), zIndex: 1000 }}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? <FullscreenExit /> : <Fullscreen />}
          </Fab>
        </Tooltip>
      ) : null}
      <Fab
        size='small'
        aria-label={recenterLabel}
        sx={{
          position: 'absolute',
          top: 10,
          right: slot(onToggleFullscreen ? 1 : 0),
          zIndex: 1000,
        }}
        onClick={onRecenter}
      >
        <CenterFocusStrong />
      </Fab>
      <Fab
        size='small'
        aria-label='Filters'
        sx={{
          position: 'absolute',
          top: 10,
          right: slot(onToggleFullscreen ? 2 : 1),
          zIndex: 1000,
          display: { xs: 'inline-flex', md: 'none' },
        }}
        onClick={onOpenFilters}
      >
        <FilterAlt />
      </Fab>
      {children}
    </Box>
  );
});

// ── Full screen ────────────────────────────────────────────────────

export interface DiffMapFullscreen {
  fullscreen: boolean;
  toggle: () => void;
  exit: () => void;
}

/**
 * Full-screen state of a diff map page. The layout covers the viewport, and
 * the browser's full-screen mode is requested on the whole document (not the
 * map), so the filter panel's menus and tooltips, which render in portals on
 * <body>, keep working. Esc or leaving browser full screen exits.
 */
export function useDiffMapFullscreen(): DiffMapFullscreen {
  const [fullscreen, setFullscreen] = useState(false);

  const exit = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement != null) {
      document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const toggle = useCallback(() => {
    if (fullscreen) {
      exit();
      return;
    }
    setFullscreen(true);
    // Optional: the overlay works without it (e.g. iOS Safari).
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, [fullscreen, exit]);

  useEffect(() => {
    if (!fullscreen) return;
    const onChange = (): void => {
      if (document.fullscreenElement == null) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      // Menus and dialogs handle Esc themselves first.
      if (e.key === 'Escape' && !e.defaultPrevented) exit();
    };
    // The page scrolls on <html>: lock both so no scrollbar is painted over
    // the overlay.
    const root = document.documentElement;
    const overflow = [root.style.overflow, document.body.style.overflow];
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = overflow[0];
      document.body.style.overflow = overflow[1];
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('keydown', onKey);
    };
  }, [fullscreen, exit]);

  // Leaving the page in full screen also leaves browser full screen.
  useEffect(
    () => () => {
      if (document.fullscreenElement != null) {
        document.exitFullscreen().catch(() => undefined);
      }
    },
    [],
  );

  return { fullscreen, toggle, exit };
}

/**
 * The filter panel + map row of a diff map page. In full screen it covers the
 * viewport (above the site header, below menus and dialogs) with a bar on top
 * for the title, the active filters and the way out.
 */
export function DiffMapLayout({
  fullscreen,
  onExitFullscreen,
  title,
  toolbar,
  children,
}: React.PropsWithChildren<{
  fullscreen: boolean;
  onExitFullscreen: () => void;
  /** Shown in the full-screen bar, e.g. "Stops map". */
  title: string;
  /** Extra content of the full-screen bar (active filter chips). */
  toolbar?: React.ReactNode;
}>): React.ReactElement {
  return (
    <Box
      role={fullscreen ? 'dialog' : undefined}
      aria-modal={fullscreen ? true : undefined}
      aria-label={fullscreen ? `${title}, full screen` : undefined}
      sx={
        fullscreen
          ? {
              position: 'fixed',
              inset: 0,
              // Above the app bar and drawers, below menus / dialogs (1300).
              zIndex: (t) => t.zIndex.drawer + 50,
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: { xs: 1, md: 2 },
              height: '100dvh',
            }
          : {
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: { xs: 'auto', md: 'max(640px, calc(100vh - 200px))' },
              mb: 3,
            }
      }
    >
      {fullscreen ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            minHeight: 40,
            flexWrap: 'nowrap',
          }}
        >
          <Typography variant='h6' fontWeight={700} sx={{ flexShrink: 0 }}>
            {title}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>{toolbar}</Box>
          <Button
            variant='outlined'
            size='small'
            startIcon={<FullscreenExit />}
            onClick={onExitFullscreen}
            sx={{ flexShrink: 0 }}
          >
            Exit full screen
          </Button>
        </Box>
      ) : null}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
        {children}
      </Box>
    </Box>
  );
}
