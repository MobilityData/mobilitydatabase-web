'use client';

import { Box } from '@mui/material';
import {
  memo,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import GeoData from './SummitGeoData.json';

import { FEED_COUNTS_BY_COUNTRY } from './feed-counts';
import {
  type CountryStats,
  feedCountIntensity,
  getCountryStats,
} from './feed-stats';
import {
  CountryStatsPopup,
  FeedLegend,
  POPUP_OFFSET,
  POPUP_WIDTH,
} from './CountryStatsPopup';
import { fitPopup, type PopupFit } from './popup-placement';
import {
  exitFullscreenDocument,
  requestFullscreenForElement,
} from './fullscreen';
import { type GlobeColors, mixHex } from './globe-colors';
import {
  decodeCountries,
  easeInOutCubic,
  largestOuterRing,
  mainlandCentroid,
  ringEncirclesPole,
  type Topology,
} from './geo-shapes';
import {
  buildOutlinePath,
  clampView,
  IDENTITY_VIEW,
  MAP_HEIGHT,
  MAP_WIDTH,
  type MapView,
  polygonsToPath,
  projectedRingBounds,
  projectLonLat,
  viewForBounds,
  wrapLongitude,
} from './flat-map-geometry';
import { NUM_TO_ISO2 } from './iso-numeric';
import { MapToolbar } from './MapToolbar';
import { createTourPicker, TOUR_DWELL_SECONDS } from './tour';
import { useGlobeColors } from './useGlobeColors';
import { useTourMode } from './useTourMode';

interface FlatCountry {
  iso2: string;
  name: string;
  feedCount: number;
  /** 0..1 log-scaled shade; 0 for countries without feeds. */
  intensity: number;
  /** SVG path in map units. */
  d: string;
  /** Map-unit point the popup is pinned to (main landmass). */
  anchor: [number, number];
  /** Map-unit bbox of the main landmass, used to frame tour stops. */
  bounds: [number, number, number, number];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const TOUR_MIN_ZOOM = 1.6;
const TOUR_MAX_ZOOM = 4;
const TOUR_TWEEN_SECONDS = 1.6;
const DRAG_THRESHOLD = 4;
// Used to place a popup before its real height is measured (the typical
// card with a few regions); corrected before paint by the layout effect.
const POPUP_HEIGHT_ESTIMATE = 190;

// The geometry is static, so it's built once per module (on the server for
// SSR, then once in the browser) rather than per mount.
let cachedCountries: FlatCountry[] | null = null;
function getFlatCountries(): FlatCountry[] {
  if (cachedCountries) return cachedCountries;
  const features = decodeCountries(GeoData as unknown as Topology, 'countries');
  const countries: FlatCountry[] = [];
  for (const feat of features) {
    // Antarctica has no feeds and would dominate the bottom of the map.
    if (feat.polygons.some((rings) => rings[0] && ringEncirclesPole(rings[0])))
      continue;
    const iso2 = NUM_TO_ISO2[String(feat.id).padStart(3, '0')];
    const mainland = largestOuterRing(feat.polygons);
    if (!iso2 || !mainland) continue;
    const feedCount = FEED_COUNTS_BY_COUNTRY[iso2]?.feedCount ?? 0;
    const [lon, lat] = mainlandCentroid(feat.polygons);
    countries.push({
      iso2,
      name: feat.name ?? FEED_COUNTS_BY_COUNTRY[iso2]?.name ?? iso2,
      feedCount,
      intensity: feedCountIntensity(feedCount),
      d: polygonsToPath(feat.polygons),
      anchor: projectLonLat(wrapLongitude(lon), lat),
      bounds: projectedRingBounds(mainland),
    });
  }
  cachedCountries = countries;
  return countries;
}

function countryFill(country: FlatCountry, colors: GlobeColors): string {
  return country.feedCount > 0
    ? mixHex(colors.low, colors.high, country.intensity)
    : colors.inactive;
}

// Memoised so selection, fullscreen and tour state changes don't re-render
// ~180 paths; only a colour-scheme switch does.
const CountryLayer = memo(function CountryLayer({
  countries,
  colors,
}: {
  countries: FlatCountry[];
  colors: GlobeColors;
}): ReactElement {
  return (
    <g stroke={colors.border} strokeWidth={0.6} strokeLinejoin='round'>
      {countries.map((country, i) => (
        <path
          key={`${country.iso2}-${i}`}
          className='country'
          d={country.d}
          data-iso2={country.iso2}
          fill={countryFill(country, colors)}
        />
      ))}
    </g>
  );
});

const OUTLINE_PATH = buildOutlinePath();

export default function WorldFlatMapFeeds({
  allowFullscreen = false,
  preview = false,
}: {
  allowFullscreen?: boolean;
  /**
   * Embedded, page-friendly mode (landing page): no wheel zoom or drag pan,
   * so scrolling over the map scrolls the page, and it fills its parent
   * instead of enforcing a 500px minimum.
   */
  preview?: boolean;
}): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewGroupRef = useRef<SVGGElement>(null);
  const { tourMode, tourModeRef, runTourTickRef, toggleTour, startTour } =
    useTourMode();
  // As on the globe, pan/zoom and the popup position are written straight
  // to the DOM so dragging doesn't re-render; only the popup's content goes
  // through React state.
  const popupElRef = useRef<HTMLDivElement>(null);
  const popupPosRef = useRef<{ x: number; y: number } & PopupFit>({
    x: 0,
    y: 0,
    placement: 'above',
    shift: 0,
  });
  const updatePopupRef = useRef<(measure?: boolean) => void>(() => {});

  const [selected, setSelected] = useState<CountryStats | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const clipId = `flat-map-clip-${useId().replace(/:/g, '')}`;
  const countries = getFlatCountries();
  const countryByIso2 = useMemo(
    () => new Map(countries.map((c) => [c.iso2, c])),
    [countries],
  );
  const selectedCountry =
    selected != null ? countryByIso2.get(selected.iso2) : undefined;

  const colors = useGlobeColors();

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    const viewGroup = viewGroupRef.current;
    if (!container || !svg || !viewGroup) return;

    // Cached so popup placement never forces a layout read mid-animation.
    const size = {
      width: container.clientWidth,
      height: container.clientHeight,
    };
    let view: MapView = IDENTITY_VIEW;
    let current: FlatCountry | null = null;

    // viewBox -> container px for preserveAspectRatio="xMidYMid meet".
    function viewBoxFit(): { s: number; ox: number; oy: number } {
      const s = Math.min(size.width / MAP_WIDTH, size.height / MAP_HEIGHT);
      return {
        s,
        ox: (size.width - MAP_WIDTH * s) / 2,
        oy: (size.height - MAP_HEIGHT * s) / 2,
      };
    }

    // Measured once per selection (see the layout effect below), not per
    // frame, so panning never forces a layout read.
    let popupHeight = POPUP_HEIGHT_ESTIMATE;

    function updatePopupPosition(measure = false): void {
      if (!current) return;
      const el = popupElRef.current;
      const card = el?.firstElementChild;
      if (measure && card instanceof HTMLElement) {
        popupHeight = card.offsetHeight;
      }
      const { s, ox, oy } = viewBoxFit();
      const x = ox + s * (view.x + view.k * current.anchor[0]);
      const y = oy + s * (view.y + view.k * current.anchor[1]);
      // Flip/slide the card so a country near an edge still shows it whole.
      const fit = fitPopup({
        x,
        y,
        width: size.width,
        height: size.height,
        cardWidth: POPUP_WIDTH,
        cardHeight: popupHeight,
        offset: POPUP_OFFSET,
      });
      popupPosRef.current = { x, y, ...fit };
      if (el) {
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        el.style.setProperty('--popup-shift', `${fit.shift}px`);
        el.dataset.placement = fit.placement;
      }
    }
    updatePopupRef.current = updatePopupPosition;

    function applyView(next: MapView): void {
      view = clampView(next, MIN_ZOOM, MAX_ZOOM);
      viewGroup!.setAttribute(
        'transform',
        `translate(${view.x} ${view.y}) scale(${view.k})`,
      );
      updatePopupPosition();
    }

    function selectCountry(country: FlatCountry): void {
      current = country;
      updatePopupPosition();
      setSelected(getCountryStats(country.iso2, country.name));
    }

    function deselect(): void {
      current = null;
      setSelected(null);
    }

    // ---- Pan/zoom tween (tour) ----
    let tweenRaf = 0;
    function tweenTo(target: MapView, onDone: () => void): void {
      cancelAnimationFrame(tweenRaf);
      const from = view;
      const start = performance.now();
      function step(now: number): void {
        const p = Math.min(1, (now - start) / (TOUR_TWEEN_SECONDS * 1000));
        const e = easeInOutCubic(p);
        applyView({
          k: from.k + (target.k - from.k) * e,
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
        });
        if (p < 1) tweenRaf = requestAnimationFrame(step);
        else {
          tweenRaf = 0;
          onDone();
        }
      }
      tweenRaf = requestAnimationFrame(step);
    }

    // ---- Auto tour ----
    // Flies to a country with feeds, dwells, then moves on. Self-rescheduling
    // timeout so the dwell counts from when the country is framed.
    const pickTourStop = createTourPicker(
      countries.filter((c) => c.feedCount > 0),
    );
    let tourTimeoutId: ReturnType<typeof setTimeout> | undefined;

    function scheduleTourTick(delaySeconds: number): void {
      clearTimeout(tourTimeoutId);
      tourTimeoutId = setTimeout(runTourTick, delaySeconds * 1000);
    }

    function runTourTick(): void {
      if (!tourModeRef.current) return;
      const stop = pickTourStop();
      if (!stop) return;
      deselect();
      tweenTo(
        viewForBounds(stop.bounds, stop.anchor, {
          minZoom: TOUR_MIN_ZOOM,
          maxZoom: TOUR_MAX_ZOOM,
        }),
        () => {
          selectCountry(stop);
          scheduleTourTick(TOUR_DWELL_SECONDS);
        },
      );
    }
    runTourTickRef.current = runTourTick;

    // ---- Pointer interaction ----
    let isDragging = false;
    let dragMoved = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let downIso2: string | null = null;

    function onPointerDown(event: PointerEvent): void {
      isDragging = true;
      dragMoved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      downIso2 =
        (event.target as Element | null)
          ?.closest('[data-iso2]')
          ?.getAttribute('data-iso2') ?? null;
      if (tweenRaf) {
        // Hand control to the user, but keep the tour going afterwards.
        cancelAnimationFrame(tweenRaf);
        tweenRaf = 0;
        scheduleTourTick(TOUR_DWELL_SECONDS);
      }
    }

    function onPointerMove(event: PointerEvent): void {
      if (!isDragging || preview) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!dragMoved) svg!.style.cursor = 'grabbing';
      dragMoved = true;
      const { s } = viewBoxFit();
      applyView({ ...view, x: view.x + dx / s, y: view.y + dy / s });
      dragStartX = event.clientX;
      dragStartY = event.clientY;
    }

    function endDrag(): void {
      isDragging = false;
      svg!.style.cursor = preview ? '' : 'grab';
    }

    function onPointerUp(): void {
      if (!isDragging) return;
      endDrag();
      if (dragMoved) return;
      const country = downIso2 ? countryByIso2.get(downIso2) : undefined;
      if (country) selectCountry(country);
      else deselect();
    }

    function onPointerCancel(): void {
      if (isDragging) endDrag();
    }

    // Zooms around the cursor.
    function onWheel(event: WheelEvent): void {
      event.preventDefault();
      const rect = container!.getBoundingClientRect();
      const { s, ox, oy } = viewBoxFit();
      const mx = (event.clientX - rect.left - ox) / s;
      const my = (event.clientY - rect.top - oy) / s;
      const k = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, view.k * Math.exp(-event.deltaY * 0.002)),
      );
      const ux = (mx - view.x) / view.k;
      const uy = (my - view.y) / view.k;
      applyView({ k, x: mx - ux * k, y: my - uy * k });
    }

    function onDoubleClick(): void {
      if (!allowFullscreen) return;
      if (document.fullscreenElement === container) exitFullscreenDocument();
      else requestFullscreenForElement(container);
    }

    function handleFullscreenChange(): void {
      const nowFullscreen = document.fullscreenElement === container;
      setIsFullscreen(nowFullscreen);
      // Fullscreen is the hands-off presentation mode, so it starts the tour.
      if (nowFullscreen) startTour();
    }

    svg.style.cursor = preview ? '' : 'grab';
    svg.style.touchAction = preview ? 'auto' : 'none';
    svg.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    if (!preview) svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('dblclick', onDoubleClick);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const ro = new ResizeObserver(() => {
      size.width = container.clientWidth;
      size.height = container.clientHeight;
      updatePopupPosition();
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(tweenRaf);
      clearTimeout(tourTimeoutId);
      ro.disconnect();
      svg.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('dblclick', onDoubleClick);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      runTourTickRef.current = () => {};
      updatePopupRef.current = () => {};
    };
  }, []);

  // The popup mounts one render after selection, so measure its real height
  // and re-place it before the browser paints (no visible jump).
  useLayoutEffect(() => {
    if (selected != null) updatePopupRef.current(true);
  }, [selected]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: preview ? 0 : 500,
        // Preview is sized to the map itself, leaving little room around a
        // country, so the popup may spill past the edges. The SVG still
        // clips the map.
        overflow: preview ? 'visible' : 'hidden',
        // Also covers the browser's black backdrop in fullscreen.
        bgcolor: 'background.default',
      }}
    >
      <Box
        component='svg'
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio='xMidYMid meet'
        role='img'
        aria-label='World map of transit feeds by country'
        sx={{
          display: 'block',
          width: '100%',
          height: '100%',
          userSelect: 'none',
          // Borders stay hairline at every zoom level.
          '& path': { vectorEffect: 'non-scaling-stroke' },
          '& .country': { cursor: 'pointer', transition: 'filter 120ms' },
          '& .country:hover': { filter: 'brightness(1.12)' },
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={OUTLINE_PATH} />
          </clipPath>
        </defs>
        <g ref={viewGroupRef}>
          <g clipPath={`url(#${clipId})`}>
            <CountryLayer countries={countries} colors={colors} />
            {selectedCountry != null && (
              <path
                d={selectedCountry.d}
                fill={colors.selected}
                stroke={colors.high}
                strokeWidth={1.2}
                pointerEvents='none'
              />
            )}
          </g>
        </g>
      </Box>

      {selected != null && (
        <CountryStatsPopup
          key={selected.iso2}
          ref={popupElRef}
          stats={selected}
          position={popupPosRef.current}
          placement={popupPosRef.current.placement}
          shift={popupPosRef.current.shift}
        />
      )}

      <MapToolbar
        preview={preview}
        allowFullscreen={allowFullscreen}
        isFullscreen={isFullscreen}
        tourMode={tourMode}
        onToggleTour={toggleTour}
        onFullscreen={() => {
          requestFullscreenForElement(containerRef.current);
        }}
      />

      {!preview && <FeedLegend low={colors.low} high={colors.high} />}
    </Box>
  );
}
