import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

let registered = false;

/** Registers the pmtiles:// protocol with MapLibre, once per page. */
export function ensurePmtilesProtocol(): void {
  if (registered) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  registered = true;
}

/** A diff file's URL as a pmtiles:// source URL (absolute, as the protocol needs). */
export function pmtilesUrl(fileUrl: string): string {
  const base =
    typeof window === 'undefined' ? 'http://localhost' : window.location.href;
  return `pmtiles://${new URL(fileUrl, base).href}`;
}
