'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GtfsDate } from '../../lib/entity-diff-types';
import type { TripsCalendarDoc } from '../../lib/trips-calendar';

/** Query param of the day whose popup is open: ?day=20250314. */
const DAY_PARAM = 'day';

/** ?day= when it names a compared date of the calendar. */
function readDay(calendar: TripsCalendarDoc | null): GtfsDate | null {
  const d = new URLSearchParams(window.location.search).get(DAY_PARAM);
  return d != null && calendar?.days[d] != null ? d : null;
}

function writeDay(date: GtfsDate | null, mode: 'push' | 'replace'): void {
  const params = new URLSearchParams(window.location.search);
  if (date == null) params.delete(DAY_PARAM);
  else params.set(DAY_PARAM, date);
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

export interface OpenDay {
  open: GtfsDate | null;
  /** Open a day from the page: a history entry, so Back closes it. */
  openDay: (date: GtfsDate) => void;
  /** Move to another day inside the popup: replaces the entry. */
  navigateDay: (date: GtfsDate) => void;
  closeDay: () => void;
}

/**
 * The day popup's date, kept in ?day= so leaving for a route page and
 * coming Back reopens the popup. The page is static: the URL is read after
 * mount, and on Back / Forward.
 */
export function useOpenDay(calendar: TripsCalendarDoc | null): OpenDay {
  const [open, setOpen] = useState<GtfsDate | null>(null);
  // Whether this page pushed the entry the popup is open on.
  const pushed = useRef(false);

  useEffect(() => {
    setOpen(readDay(calendar));
    const onPop = (): void => {
      pushed.current = false;
      setOpen(readDay(calendar));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [calendar]);

  // Read by the callbacks without making them change on every open.
  const openRef = useRef(open);
  openRef.current = open;

  const openDay = useCallback((date: GtfsDate) => {
    if (openRef.current == null) {
      writeDay(date, 'push');
      pushed.current = true;
    } else writeDay(date, 'replace');
    setOpen(date);
  }, []);

  const navigateDay = useCallback((date: GtfsDate) => {
    writeDay(date, 'replace');
    setOpen(date);
  }, []);

  const closeDay = useCallback(() => {
    setOpen(null);
    // Undo our own entry so Back doesn't reopen the popup; a popup opened
    // from the URL (a link, or Back from a route page) just drops ?day=.
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else writeDay(null, 'replace');
  }, []);

  return { open, openDay, navigateDay, closeDay };
}
