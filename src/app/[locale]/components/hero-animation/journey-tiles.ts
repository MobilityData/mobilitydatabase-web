import { mapConfig, ThemeModeEnum } from '../../../Theme';
import {
  createProjection,
  tilesCovering,
  type LonLat,
  type TileRange,
} from './montreal-journey';

// Where the hero's basemap tiles live, kept free of three.js so the page's
// first bundle can start fetching them. The scene itself needs the same
// framing, so the camera-independent constants live here rather than beside
// the scene — one source of truth for the tile range.

/** World units are kilometres. */
export const KM_PER_UNIT = 1;
/** Ground point at the world origin: between the journey's two ends. */
export const FOCUS: LonLat = [-73.574, 45.4945];
/** Basemap coverage around the focus, in world units, and its tile zoom. */
export const TILE_ZOOM = 13;
export const MAP_HALF_WIDTH = 7.5;
export const MAP_HALF_DEPTH = 7.5;

export function tileUrl(
  template: string,
  zoom: number,
  x: number,
  y: number,
): string {
  return template
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', '@2x');
}

/** The app's basemap style, minus its labels: the chips do the talking. */
export function tilesFor(mode: ThemeModeEnum): string {
  return mapConfig[
    mode === ThemeModeEnum.dark ? 'dark' : 'light'
  ].basemapTileUrl.replace('_all/', '_nolabels/');
}

/** The tiles the scene's ground plane is stitched from. */
export function journeyTileRange(): TileRange {
  return tilesCovering(
    createProjection(FOCUS, KM_PER_UNIT),
    TILE_ZOOM,
    MAP_HALF_WIDTH,
    MAP_HALF_DEPTH,
  );
}

/**
 * An inline script that preloads the scene's tiles from the document itself.
 *
 * The tiles are the hero's slowest dependency — thirty cross-origin images
 * that nothing renders until they have all settled — and nothing about them
 * depends on three.js, so waiting for its chunk to arrive and evaluate costs
 * about a second. These are the same CARTO URLs the scene would request
 * anyway; the browser just starts them while it is still parsing the HTML.
 *
 * It is a script rather than markup because the choice of light or dark tiles
 * is only known in the browser. `InitColorSchemeScript` has already resolved
 * it onto the document element, so reading it here loads exactly one set,
 * where `media='(prefers-color-scheme: …)'` on plain `<link>` tags would fetch
 * the wrong thirty for anyone whose in-app theme differs from their system's.
 *
 * `crossorigin` has to match the scene's own `Image.crossOrigin` or the two
 * would miss each other: the cache keeps CORS and no-CORS responses apart.
 */
export function tilePreloadScript(): string {
  const range = journeyTileRange();
  const light = JSON.stringify(tilesFor(ThemeModeEnum.light));
  const dark = JSON.stringify(tilesFor(ThemeModeEnum.dark));
  return `(function(){try{
var t=document.documentElement.classList.contains('dark')?${dark}:${light};
var f=document.createDocumentFragment();
for(var y=${range.minY};y<=${range.maxY};y++)for(var x=${range.minX};x<=${range.maxX};x++){
var l=document.createElement('link');l.rel='preload';l.as='image';l.crossOrigin='anonymous';
l.href=t.replace('{z}','${range.zoom}').replace('{x}',x).replace('{y}',y).replace('{r}','@2x');
f.appendChild(l);}
document.head.appendChild(f);}catch(e){}})()`;
}
