'use client';

/**
 * Cross-entity navigation for the diff report. Panels link to each other
 * (a stop's routes, a route's stops and services, …) through `navigate`.
 * Each entity is its own page and the focus lives in the hash, so links are
 * shareable:
 *
 *   /gtfs-diff-tool-v2/<dataset>/stops#stop/100007
 *   /gtfs-diff-tool-v2/<dataset>/calendar#service/LMMJV-E
 *   /gtfs-diff-tool-v2/<dataset>/routes#shape/C6-A01_SHP
 *
 * Older single-page links (#routes/route/M1) still resolve.
 */

import { createContext, useContext } from 'react';

export type NavKind = 'stop' | 'route' | 'service' | 'shape';

export interface NavTarget {
  tab: string;
  kind?: NavKind;
  id?: string;
}

/** A target plus a counter so re-navigating to the same target still fires. */
export interface NavFocus extends NavTarget {
  nonce: number;
}

const KINDS: NavKind[] = ['stop', 'route', 'service', 'shape'];

export function parseHash(hash: string): NavTarget | null {
  // Legacy calendar deep link: #service-<service_id>
  if (hash.startsWith('#service-')) {
    return {
      tab: 'calendar',
      kind: 'service',
      id: decodeURIComponent(hash.slice(9)),
    };
  }
  const m = /^#([a-z_0-9]+)(?:\/([a-z]+)\/(.+))?$/.exec(hash);
  if (m == null) return null;
  const kind = m[2] as NavKind | undefined;
  if (kind && !KINDS.includes(kind)) return { tab: m[1] };
  return { tab: m[1], kind, id: m[3] ? decodeURIComponent(m[3]) : undefined };
}

/**
 * Each entity has its own page (/gtfs-diff-tool-v2/<dataset>/<entity>), so
 * its hash only carries the focus: #route/M1, #stop/100007.
 */
export function toFocusHash(t: NavTarget): string {
  return t.kind && t.id ? `#${t.kind}/${encodeURIComponent(t.id)}` : '';
}

/**
 * Target in the hash of the page showing `tab`: the focus form (#route/M1),
 * or a link from before entities had their own pages (#routes/route/M1,
 * #service-<id>), whose tab may be another entity.
 */
export function parseLocationHash(hash: string, tab: string): NavTarget | null {
  const m = /^#([a-z]+)\/(.+)$/.exec(hash);
  if (m && (KINDS as string[]).includes(m[1])) {
    return { tab, kind: m[1] as NavKind, id: decodeURIComponent(m[2]) };
  }
  return parseHash(hash);
}

export interface DiffNav {
  /** Switch tab (if needed) and focus a target; adds a history entry. */
  navigate: (target: NavTarget) => void;
  /** Reflect an in-tab selection in the URL without re-focusing. */
  replaceTarget: (target: NavTarget) => void;
}

const DiffNavContext = createContext<DiffNav | null>(null);

export const DiffNavProvider = DiffNavContext.Provider;

/** Null outside the v2 page, so shared components can render without links. */
export function useDiffNav(): DiffNav | null {
  return useContext(DiffNavContext);
}
