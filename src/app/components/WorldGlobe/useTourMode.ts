import { type MutableRefObject, useCallback, useRef, useState } from 'react';

export interface TourMode {
  tourMode: boolean;
  /** Mirrors `tourMode` for the scene effect, which never re-runs. */
  tourModeRef: MutableRefObject<boolean>;
  /** The scene effect installs its tick function here. */
  runTourTickRef: MutableRefObject<() => void>;
  toggleTour: () => void;
  /** Starts the tour if it isn't already running (fullscreen does this). */
  startTour: () => void;
}

export function useTourMode(): TourMode {
  const [tourMode, setTourMode] = useState(false);
  const tourModeRef = useRef(false);
  const runTourTickRef = useRef<() => void>(() => {});

  const toggleTour = useCallback((): void => {
    const next = !tourModeRef.current;
    tourModeRef.current = next;
    setTourMode(next);
    if (next) runTourTickRef.current();
  }, []);

  const startTour = useCallback((): void => {
    if (tourModeRef.current) return;
    tourModeRef.current = true;
    setTourMode(true);
    runTourTickRef.current();
  }, []);

  return { tourMode, tourModeRef, runTourTickRef, toggleTour, startTour };
}
