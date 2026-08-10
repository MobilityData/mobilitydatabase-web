// @ts-nocheck
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import earcut from 'earcut';
import {
  ATTENDEES_BY_COUNTRY,
  SUMMIT_ATTENDEES,
  SUMMIT_COUNTRIES,
  logoUrlForDomain,
} from './summit-attendees';
import starSprite from './star.png';

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
};

function requestFullscreenForElement(element: HTMLElement | null) {
  if (!element) return;
  const el = element as FullscreenElement;
  if (el.requestFullscreen) {
    void el.requestFullscreen();
    return;
  }
  if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  }
}

function exitFullscreenDocument() {
  const doc = document as FullscreenDocument;
  if (document.exitFullscreen) {
    void document.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    void doc.webkitExitFullscreen();
  }
}

// ---- Feed data (country ISO2 code -> feed count) ----
const FEED_DATA = {
  US: 2163,
  FR: 1138,
  JP: 658,
  DE: 425,
  CA: 397,
  ES: 234,
  IT: 204,
  PL: 161,
  GB: 115,
  FI: 90,
  CH: 87,
  NO: 86,
  CZ: 85,
  NL: 78,
  BE: 72,
  AU: 62,
  AT: 52,
  PT: 46,
  RO: 44,
  DK: 40,
  HU: 39,
  HR: 36,
  NZ: 30,
  IE: 29,
  SE: 26,
  SI: 24,
  LU: 23,
  SK: 20,
  BR: 19,
  LT: 17,
  UA: 17,
  MC: 14,
  BG: 12,
  RS: 12,
  MX: 10,
  MY: 10,
  GR: 10,
  IN: 9,
  TR: 9,
  AE: 9,
  CY: 8,
  LI: 8,
  DZ: 8,
  ML: 7,
  CL: 7,
  SA: 7,
  TN: 7,
  AR: 7,
  ET: 6,
  MA: 6,
  LV: 6,
  IL: 5,
  RU: 5,
  SO: 4,
  SG: 4,
  TG: 4,
  TW: 4,
  BA: 4,
  EE: 4,
  MD: 4,
  NE: 4,
  NI: 3,
  CO: 3,
  MK: 3,
  CM: 3,
  PE: 3,
  EG: 3,
  BF: 3,
  GH: 3,
  ID: 3,
  KE: 2,
  IS: 2,
  GL: 2,
  CD: 2,
  ME: 2,
  BY: 2,
  RW: 2,
  CN: 2,
  PH: 2,
  AD: 2,
  ZW: 1,
  AL: 1,
  AM: 1,
  BJ: 1,
  BM: 1,
  BO: 1,
  CI: 1,
  CR: 1,
  CV: 1,
  DO: 1,
  GE: 1,
  GG: 1,
  JO: 1,
  KH: 1,
  LA: 1,
  MM: 1,
  SL: 1,
  SN: 1,
  TH: 1,
  UG: 1,
  ZA: 1,
};

// world-atlas 110m uses numeric ISO country codes (ISO 3166-1 numeric).
const NUM_TO_ISO2 = {
  '004': 'AF',
  '008': 'AL',
  '010': 'AQ',
  '012': 'DZ',
  '016': 'AS',
  '020': 'AD',
  '024': 'AO',
  '028': 'AG',
  '031': 'AZ',
  '032': 'AR',
  '036': 'AU',
  '040': 'AT',
  '044': 'BS',
  '048': 'BH',
  '050': 'BD',
  '051': 'AM',
  '052': 'BB',
  '056': 'BE',
  '060': 'BM',
  '064': 'BT',
  '068': 'BO',
  '070': 'BA',
  '072': 'BW',
  '076': 'BR',
  '084': 'BZ',
  '090': 'SB',
  '092': 'VG',
  '096': 'BN',
  '100': 'BG',
  '104': 'MM',
  '108': 'BI',
  '112': 'BY',
  '116': 'KH',
  '120': 'CM',
  '124': 'CA',
  '132': 'CV',
  '136': 'KY',
  '140': 'CF',
  '144': 'LK',
  '148': 'TD',
  '152': 'CL',
  '156': 'CN',
  '158': 'TW',
  '162': 'CX',
  '166': 'CC',
  '170': 'CO',
  '174': 'KM',
  '175': 'YT',
  '178': 'CG',
  '180': 'CD',
  '184': 'CK',
  '188': 'CR',
  '191': 'HR',
  '192': 'CU',
  '196': 'CY',
  '203': 'CZ',
  '204': 'BJ',
  '208': 'DK',
  '212': 'DM',
  '214': 'DO',
  '218': 'EC',
  '222': 'SV',
  '226': 'GQ',
  '231': 'ET',
  '232': 'ER',
  '233': 'EE',
  '234': 'FO',
  '238': 'FK',
  '239': 'GS',
  '242': 'FJ',
  '246': 'FI',
  '248': 'AX',
  '250': 'FR',
  '254': 'GF',
  '258': 'PF',
  '260': 'TF',
  '262': 'DJ',
  '266': 'GA',
  '268': 'GE',
  '270': 'GM',
  '275': 'PS',
  '276': 'DE',
  '288': 'GH',
  '292': 'GI',
  '296': 'KI',
  '300': 'GR',
  '304': 'GL',
  '308': 'GD',
  '312': 'GP',
  '316': 'GU',
  '320': 'GT',
  '324': 'GN',
  '328': 'GY',
  '332': 'HT',
  '334': 'HM',
  '336': 'VA',
  '340': 'HN',
  '344': 'HK',
  '348': 'HU',
  '352': 'IS',
  '356': 'IN',
  '360': 'ID',
  '364': 'IR',
  '368': 'IQ',
  '372': 'IE',
  '376': 'IL',
  '380': 'IT',
  '384': 'CI',
  '388': 'JM',
  '392': 'JP',
  '398': 'KZ',
  '400': 'JO',
  '404': 'KE',
  '408': 'KP',
  '410': 'KR',
  '414': 'KW',
  '417': 'KG',
  '418': 'LA',
  '422': 'LB',
  '426': 'LS',
  '428': 'LV',
  '430': 'LR',
  '434': 'LY',
  '438': 'LI',
  '440': 'LT',
  '442': 'LU',
  '446': 'MO',
  '450': 'MG',
  '454': 'MW',
  '458': 'MY',
  '462': 'MV',
  '466': 'ML',
  '470': 'MT',
  '474': 'MQ',
  '478': 'MR',
  '480': 'MU',
  '484': 'MX',
  '492': 'MC',
  '496': 'MN',
  '498': 'MD',
  '499': 'ME',
  '500': 'MS',
  '504': 'MA',
  '508': 'MZ',
  '512': 'OM',
  '516': 'NA',
  '520': 'NR',
  '524': 'NP',
  '528': 'NL',
  '531': 'CW',
  '533': 'AW',
  '534': 'SX',
  '535': 'BQ',
  '540': 'NC',
  '548': 'VU',
  '554': 'NZ',
  '558': 'NI',
  '562': 'NE',
  '566': 'NG',
  '570': 'NU',
  '574': 'NF',
  '578': 'NO',
  '580': 'MP',
  '581': 'UM',
  '583': 'FM',
  '584': 'MH',
  '585': 'PW',
  '586': 'PK',
  '591': 'PA',
  '598': 'PG',
  '600': 'PY',
  '604': 'PE',
  '608': 'PH',
  '612': 'PN',
  '616': 'PL',
  '620': 'PT',
  '624': 'GW',
  '626': 'TL',
  '630': 'PR',
  '634': 'QA',
  '638': 'RE',
  '642': 'RO',
  '643': 'RU',
  '646': 'RW',
  '652': 'BL',
  '654': 'SH',
  '659': 'KN',
  '660': 'AI',
  '662': 'LC',
  '663': 'MF',
  '666': 'PM',
  '670': 'VC',
  '674': 'SM',
  '678': 'ST',
  '682': 'SA',
  '686': 'SN',
  '688': 'RS',
  '690': 'SC',
  '694': 'SL',
  '702': 'SG',
  '703': 'SK',
  '704': 'VN',
  '705': 'SI',
  '706': 'SO',
  '710': 'ZA',
  '716': 'ZW',
  '724': 'ES',
  '728': 'SS',
  '729': 'SD',
  '732': 'EH',
  '740': 'SR',
  '744': 'SJ',
  '748': 'SZ',
  '752': 'SE',
  '756': 'CH',
  '760': 'SY',
  '762': 'TJ',
  '764': 'TH',
  '768': 'TG',
  '772': 'TK',
  '776': 'TO',
  '780': 'TT',
  '784': 'AE',
  '788': 'TN',
  '792': 'TR',
  '795': 'TM',
  '796': 'TC',
  '798': 'TV',
  '800': 'UG',
  '804': 'UA',
  '807': 'MK',
  '818': 'EG',
  '826': 'GB',
  '831': 'GG',
  '832': 'JE',
  '833': 'IM',
  '834': 'TZ',
  '840': 'US',
  '850': 'VI',
  '854': 'BF',
  '858': 'UY',
  '860': 'UZ',
  '862': 'VE',
  '876': 'WF',
  '882': 'WS',
  '887': 'YE',
  '894': 'ZM',
};

const ISO2_TO_NAME_FALLBACK = {
  US: 'United States',
  FR: 'France',
  JP: 'Japan',
  DE: 'Germany',
  CA: 'Canada',
  ES: 'Spain',
  IT: 'Italy',
  PL: 'Poland',
  GB: 'United Kingdom',
};

// Continent lookup for the countries that actually appear in the summit
// attendee agency list (see summit-attendees.ts) — used by tour mode to bias
// toward hopping continents between stops rather than lingering nearby.
const ISO2_TO_CONTINENT = {
  US: 'North America',
  CA: 'North America',
  MX: 'North America',
  BR: 'South America',
  CL: 'South America',
  GB: 'Europe',
  FR: 'Europe',
  DE: 'Europe',
  ES: 'Europe',
  IT: 'Europe',
  PL: 'Europe',
  NL: 'Europe',
  BE: 'Europe',
  CH: 'Europe',
  AT: 'Europe',
  SE: 'Europe',
  NO: 'Europe',
  FI: 'Europe',
  DK: 'Europe',
  CZ: 'Europe',
  HU: 'Europe',
  JP: 'Asia',
  SG: 'Asia',
  AU: 'Oceania',
  NZ: 'Oceania',
};

// MobilityData design system palette (see MOBILITYDATA_DESIGN.md).
const MD_PERIWINKLE = '#96a1ff'; // --color-primary: line-work, data fills
const MD_PERIWINKLE_SOFT = '#c2c9ff'; // lighter periwinkle for hairline dividers
const MD_INK = '#170a2e'; // --color-accent: body copy, inverted surfaces
const MD_INK_MUTED = '#5a5170'; // muted ink for secondary body copy
const MD_WHITE = '#ffffff'; // card fill (off-white --color-bg #f7f7f7 is the globe/page surface)
const MD_FONT_PROSE = 'var(--font-mulish)'; // Mulish — headings + body
const MD_FONT_MONO = 'var(--font-ibm-plex-mono)'; // IBM Plex Mono — labels

// Summit shading: every country with attendees gets the SAME flat periwinkle
// fill (a data fill that "has to be" filled); countries with no attendees
// recede into a light periwinkle tint so they read as bright/inactive.
// Selection uses the brand's inverted ink surface. All line-work is
// periwinkle. The ocean takes the *previous* no-attendee tint (near-white)
// so it still reads as recessive relative to the lighter inactive fill.
const SUMMIT_COLOR = MD_PERIWINKLE; // even summit-attendee shade
const SUMMIT_INACTIVE = '#c7cdff'; // light periwinkle, no attendees
const SUMMIT_SELECTED = MD_INK; // click highlight (inverted surface)
const OCEAN_COLOR = '#fafbff'; // near-white — the old no-attendee tint

const STAR_PURPLE = '#a78bfa'; // background starfield tint, distinct from periwinkle line-work

// Background starfield: three concentric shells around the globe, each
// rotated at a fraction of the globe's own rotation. Rotating in lockstep
// would read as fixed to the globe; rotating each shell by a different
// fraction is what sells the parallax (outer shells drift less than inner
// ones as the globe is dragged or auto-rotates).
const STAR_LAYERS = [
  {
    count: 220,
    radiusMin: 5,
    radiusMax: 7,
    size: 4,
    opacity: 0.55,
    parallax: 0.05,
  },
  {
    count: 140,
    radiusMin: 1,
    radiusMax: 8,
    size: 2,
    opacity: 0.4,
    parallax: 0.1,
  },
  {
    count: 90,
    radiusMin: 2,
    radiusMax: 10,
    size: 2.5,
    opacity: 0.28,
    parallax: 0.18,
  },
];

function pickRandomAttendee(iso2) {
  const list = ATTENDEES_BY_COUNTRY[iso2];
  if (!list || !list.length) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function lonLatToVec3(lon, lat, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// Wraps an angle to (-PI, PI]. Used to find the *shortest* turn toward a
// target heading for globeGroup.rotation.y, which — unlike rotation.x —
// accumulates indefinitely under the ambient auto-spin rather than staying
// in a small fixed range.
function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  return angle - twoPi * Math.floor((angle + Math.PI) / twoPi);
}

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// ---------- Polygon clipping (Sutherland–Hodgman) ----------
function clipPolygon(polygon, inside, intersect) {
  if (polygon.length === 0) return [];
  const output = [];
  let prev = polygon[polygon.length - 1];
  let prevInside = inside(prev);
  for (const curr of polygon) {
    const currInside = inside(curr);
    if (currInside) {
      if (!prevInside) output.push(intersect(prev, curr));
      output.push(curr);
    } else if (prevInside) {
      output.push(intersect(prev, curr));
    }
    prev = curr;
    prevInside = currInside;
  }
  return output;
}

function clipToBox(polygon, xMin, yMin, xMax, yMax) {
  let p = polygon;
  p = clipPolygon(
    p,
    (pt) => pt[0] >= xMin,
    (a, b) => {
      const t = (xMin - a[0]) / (b[0] - a[0]);
      return [xMin, a[1] + t * (b[1] - a[1])];
    },
  );
  if (!p.length) return [];
  p = clipPolygon(
    p,
    (pt) => pt[0] <= xMax,
    (a, b) => {
      const t = (xMax - a[0]) / (b[0] - a[0]);
      return [xMax, a[1] + t * (b[1] - a[1])];
    },
  );
  if (!p.length) return [];
  p = clipPolygon(
    p,
    (pt) => pt[1] >= yMin,
    (a, b) => {
      const t = (yMin - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), yMin];
    },
  );
  if (!p.length) return [];
  p = clipPolygon(
    p,
    (pt) => pt[1] <= yMax,
    (a, b) => {
      const t = (yMax - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), yMax];
    },
  );
  return p;
}

function bboxOfRing(ring) {
  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity;
  for (const [x, y] of ring) {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  return [xMin, yMin, xMax, yMax];
}

// Make a ring's longitudes continuous across the antimeridian. Countries that
// straddle ±180° (e.g. Fiji) have rings that jump from +178° to -178°; left
// as-is their bbox spans the whole globe and earcut triangulates a spurious
// sliver at their latitude that reads as a false equator. Unwrapping keeps
// consecutive points within 180° of each other (Fiji becomes 178°..182°);
// lonLatToVec3 treats >180° as the same angle, so the 3D result is correct.
function unwrapRingLongitudes(ring) {
  if (!ring.length) return ring;
  const out = [[ring[0][0], ring[0][1]]];
  let prev = ring[0][0];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, ring[i][1]]);
    prev = lon;
  }
  return out;
}

// Build sphere-wrapped geometry for a polygon by subdividing it on a lat/lon grid.
function polygonToSphereGeometry(rings, radius, gridSize = 2) {
  const outer = rings[0] ? unwrapRingLongitudes(rings[0]) : null;
  if (!outer || outer.length < 4) return null;

  const [xMin, yMin, xMax, yMax] = bboxOfRing(outer);
  const gxMin = Math.floor(xMin / gridSize) * gridSize;
  const gyMin = Math.floor(yMin / gridSize) * gridSize;
  const gxMax = Math.ceil(xMax / gridSize) * gridSize;
  const gyMax = Math.ceil(yMax / gridSize) * gridSize;

  const positions = [];

  for (let x = gxMin; x < gxMax; x += gridSize) {
    for (let y = gyMin; y < gyMax; y += gridSize) {
      const clipped = clipToBox(outer, x, y, x + gridSize, y + gridSize);
      if (clipped.length < 3) continue;

      const flat = [];
      for (const [lx, ly] of clipped) flat.push(lx, ly);
      const tris = earcut(flat);
      if (!tris.length) continue;

      for (let i = 0; i < tris.length; i++) {
        const idx = tris[i];
        const lon = flat[idx * 2];
        const lat = flat[idx * 2 + 1];
        const v = lonLatToVec3(lon, lat, radius);
        positions.push(v.x, v.y, v.z);
      }
    }
  }

  if (!positions.length) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

// A ring encircles a pole when its longitude winds a full turn (±360°).
// Antarctica's coastline is the only such ring in the country dataset.
function ringEncirclesPole(ring) {
  let total = 0;
  for (let i = 1; i < ring.length; i++) {
    let d = ring[i][0] - ring[i - 1][0];
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    total += d;
  }
  return Math.abs(total) > 300;
}

function polygonCentroid(rings) {
  let sx = 0,
    sy = 0,
    n = 0;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      sx += lon;
      sy += lat;
      n++;
    }
  }
  return [sx / n, sy / n];
}

// Uniformly scatter `count` points across a spherical shell between
// radiusMin and radiusMax (acos(2v-1) gives uniform coverage over the
// sphere's surface, unlike a naive uniform-theta/phi distribution which
// clusters points at the poles).
function createStarLayer({
  count,
  radiusMin,
  radiusMax,
  size,
  color,
  opacity,
  map,
}) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = 2 * Math.PI * Math.random();
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radiusMin + Math.random() * (radiusMax - radiusMin);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    phases[i] = Math.random() * Math.PI * 2;
    scales[i] = 0.5 + Math.random() * 0.5;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geom.setAttribute('aScale', new THREE.Float32BufferAttribute(scales, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uMap: { value: map },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aScale;
      uniform float uTime;
      uniform float uSize;
      varying float vTwinkle;
      void main() {
        // Slow, per-star-offset pulsation so the field doesn't blink in unison.
        vTwinkle = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * aScale * vTwinkle * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform sampler2D uMap;
      varying float vTwinkle;
      void main() {
        // star.png has no real alpha channel — its background is a flattened
        // light-gray checkerboard, not transparency. Derive alpha from
        // luminance instead: the dark sparkle shape reads as opaque, the
        // light checkerboard fades out, so the sprite drops cleanly onto the
        // additive-blended point without dragging its background along.
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float luminance = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
        float shape = smoothstep(0.75, 0.35, luminance);
        if (shape <= 0.0) discard;
        gl_FragColor = vec4(uColor, shape * uOpacity * vTwinkle);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geom, mat);
  points.userData.parallax = 1;
  return points;
}

// ---------- TopoJSON -> GeoJSON (minimal inline decoder) ----------
function feature(topology, object) {
  const { arcs, transform } = topology;
  const { scale = [1, 1], translate = [0, 0] } = transform || {};
  function decodeArc(i) {
    const reverse = i < 0;
    if (reverse) i = ~i;
    const arc = arcs[i];
    let x = 0,
      y = 0;
    const out = arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
    return reverse ? out.reverse() : out;
  }
  function ringFromArcs(arcIndices) {
    const ring = [];
    for (const ai of arcIndices) {
      const pts = decodeArc(ai);
      if (ring.length) pts.shift();
      ring.push(...pts);
    }
    return ring;
  }
  return {
    type: 'FeatureCollection',
    features: object.geometries.map((g) => {
      let coordinates;
      if (g.type === 'Polygon') coordinates = g.arcs.map(ringFromArcs);
      else if (g.type === 'MultiPolygon')
        coordinates = g.arcs.map((poly) => poly.map(ringFromArcs));
      return {
        type: 'Feature',
        properties: g.properties || {},
        id: g.id,
        geometry: { type: g.type, coordinates },
      };
    }),
  };
}

// Small logo tile with graceful initials fallback if logo.dev can't serve it.
function AgencyLogo({ domain, agency }: { domain: string; agency: string }) {
  const [failed, setFailed] = useState(false);
  const initials = agency
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const boxStyle = {
    width: 44,
    height: 44,
    borderRadius: 4,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: MD_WHITE,
    border: `2px solid ${MD_PERIWINKLE}`,
    overflow: 'hidden',
  } as const;

  if (failed) {
    return (
      <div
        style={{
          ...boxStyle,
          color: MD_INK,
          fontFamily: MD_FONT_MONO,
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {initials}
      </div>
    );
  }
  return (
    <div style={boxStyle}>
      <img
        src={logoUrlForDomain(domain)}
        alt={`${agency} logo`}
        width={44}
        height={44}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// ---------- Component ----------
export default function WorldGlobeSummit({
  allowFullscreen = false,
}: {
  allowFullscreen?: boolean;
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const globeGroupRef = useRef(null);
  const rotatingRef = useRef(true);
  const countryMeshesRef = useRef([]);
  const selectedRef = useRef(null);
  const starLayersRef = useRef([]);
  const starTimeRef = useRef(0);
  const tourModeRef = useRef(false);
  const runTourTickRef = useRef(() => {});

  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tourMode, setTourMode] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 3.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Directional lighting for dimensional depth. Neutral white so the
    // periwinkle brand colour renders true (no warm/cool colour cast).
    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.68);
    keyLight.position.set(-4, 3, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
    fillLight.position.set(4, -1, -3);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.15);
    rimLight.position.set(0, 0, -5);
    scene.add(rimLight);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    const OCEAN_RADIUS = 0.998;
    const COUNTRY_RADIUS = 1.0;

    // Near-white globe body — the same tint no-attendee countries used to
    // use, kept slightly translucent for a hint of glass. Matte, low
    // specular — the brand avoids gloss; structure comes from periwinkle
    // line-work.
    const oceanGeom = new THREE.SphereGeometry(OCEAN_RADIUS, 64, 64);
    const oceanMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, //new THREE.Color(OCEAN_COLOR),
      emissive: 0x000000,
      shininess: 4,
      specular: 0xffffff,
      transparent: true,
      opacity: 0.95,
    });
    globeGroup.add(new THREE.Mesh(oceanGeom, oceanMat));

    // Atmospheric glow / halo. Radius is deliberately generous (vs. the
    // globe's own 1.0) — the wider the shell, the more screen space the
    // fresnel gradient below has to spread across, which is what reads as a
    // smooth photographic haze instead of a thin hard-edged ring.
    const atmosGeom = new THREE.SphereGeometry(1.5, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          // d runs from 0 at this shell's own silhouette (tangent to the
          // view ray) down to -1 at the point directly behind the globe.
          // Clamping it to >=0 (the old code) collapses almost the whole
          // visible back-hemisphere to a single constant value — that's why
          // it read as a flat ring instead of a fade. Mapping -d to [0,1]
          // instead gives 0 exactly at the shell's outer edge (a true fade
          // to nothing, not a hard mesh cutoff) rising smoothly to its peak
          // right next to the globe's surface, where the opaque globe
          // starts occluding the rest of the shell.
          float d = dot(viewDir, vNormal);
          float rim = clamp(-d, 0.0, 1.0);
          // t is the normalized distance out from the globe's surface
          // (0 = touching the globe, 1 = the shell's own outer edge).
          float t = 1.0 - rim;
          // Decaying on t*t (a Gaussian-shaped falloff) instead of t (plain
          // exponential) gives the curve a flat peak — zero slope right at
          // the globe's own silhouette — instead of a corner. That's what
          // reads as a soft blur at the edge rather than a hard line: the
          // globe-to-halo transition eases in before it starts falling off,
          // rather than starting to drop the instant it begins.
          float t2 = t * t;
          float alpha = 0.3 + 0.6 * exp(-8.0 * t2);
          // Periwinkle near the globe's surface, fading to white as the
          // ring thins out toward its outer edge.
          vec3 glowColor = vec3(0.588, 0.631, 1.0);
          vec3 color = mix(vec3(1.0), glowColor, rim);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: true,
      blending: THREE.NormalBlending,
    });
    scene.add(new THREE.Mesh(atmosGeom, atmosMat));

    // Inner fresnel — subtle edge darkening for depth.
    const innerAtmosGeom = new THREE.SphereGeometry(1.002, 64, 64);
    const innerAtmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
          float alpha = pow(rim, 4.0) * 0.28;
          // Periwinkle edge shade for depth (a deeper #96a1ff).
          vec3 edgeColor = vec3(0.47, 0.505, 0.78);
          gl_FragColor = vec4(edgeColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    globeGroup.add(new THREE.Mesh(innerAtmosGeom, innerAtmosMat));

    // Equator — a great circle drawn exactly at latitude 0 so it sits at the
    // true middle of the globe. Added to globeGroup so it spins/tilts with the
    // earth (staying centred at rest, following the surface when dragged).
    const equatorPoints = [];
    for (let lon = -180; lon <= 180; lon += 1) {
      equatorPoints.push(lonLatToVec3(lon, 0, COUNTRY_RADIUS * 1.003));
    }
    const equatorGeom = new THREE.BufferGeometry().setFromPoints(equatorPoints);
    const equatorMat = new THREE.LineBasicMaterial({
      color: 0x96a1ff, // periwinkle line-work
      transparent: false,
    });
    globeGroup.add(new THREE.LineLoop(equatorGeom, equatorMat));

    // Background starfield — added directly to the scene (not globeGroup) so
    // each layer can be given its own fraction of the globe's rotation below,
    // producing a parallax drift instead of spinning rigidly with the globe.
    const starTexture = new THREE.TextureLoader().load(starSprite.src);
    const starLayers = STAR_LAYERS.map((config) => {
      const points = createStarLayer({
        ...config,
        color: STAR_PURPLE,
        map: starTexture,
      });
      points.userData.parallax = config.parallax;
      scene.add(points);
      return points;
    });
    starLayersRef.current = starLayers;

    const COUNTRIES_URL =
      'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

    fetch(COUNTRIES_URL)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load country data');
        return r.json();
      })
      .then((topo) => {
        const geo = feature(topo, topo.objects.countries);
        console.log({ geo, globeGroup, COUNTRY_RADIUS, countryMeshesRef });
        buildCountries(geo, globeGroup, COUNTRY_RADIUS, countryMeshesRef);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setError(e.message || 'Failed to load');
        setLoading(false);
      });

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === renderer.domElement);
    }

    function toggleFullscreen() {
      if (document.fullscreenElement === renderer.domElement) {
        exitFullscreenDocument();
      } else {
        requestFullscreenForElement(renderer.domElement);
      }
    }

    // ---- Drag-to-rotate state ----
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;
    const DRAG_THRESHOLD = 4;

    function onPointerDown(event) {
      isDragging = true;
      dragMoved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      rotatingRef.current = false;
      tourTweening = false; // hand control straight to the drag, mid-swing or not
      renderer.domElement.style.cursor = 'grabbing';
    }

    function onPointerMove(event) {
      if (!isDragging) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragMoved = true;
      const rect = renderer.domElement.getBoundingClientRect();
      const scaleFactor = Math.PI / rect.width;
      globeGroup.rotation.y += (event.clientX - dragStartX) * scaleFactor;
      globeGroup.rotation.x += (event.clientY - dragStartY) * scaleFactor;
      globeGroup.rotation.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, globeGroup.rotation.x),
      );
      dragStartX = event.clientX;
      dragStartY = event.clientY;
    }

    function onPointerUp(event) {
      if (!isDragging) return;
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
      if (!dragMoved) {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(
          countryMeshesRef.current,
          false,
        );
        const frontHit = hits.find((hit) => {
          const hitPoint = hit.point.clone();
          const globeCenter = new THREE.Vector3(0, 0, 0).applyMatrix4(
            globeGroup.matrixWorld,
          );
          const surfaceNormal = hitPoint.clone().sub(globeCenter).normalize();
          const cameraDir = camera.position.clone().sub(hitPoint).normalize();
          return surfaceNormal.dot(cameraDir) > 0;
        });
        if (frontHit) selectCountry(frontHit.object);
        else deselect();
      } else if (!selectedRef.current) {
        rotatingRef.current = true;
      }
    }

    function onDoubleClick() {
      if (!allowFullscreen) return;
      toggleFullscreen();
    }

    function selectCountry(mesh, { freezeRotation = true } = {}) {
      if (selectedRef.current && selectedRef.current !== mesh) {
        const prev = selectedRef.current;
        prev.material.color.copy(prev.userData.baseColor);
        prev.material.emissive.setHex(0x000000);
      }
      selectedRef.current = mesh;
      // Tour mode drives the globe itself (see runTourTick) and wants it to
      // keep turning through each stop rather than parking on it the way a
      // manual click does.
      if (freezeRotation) rotatingRef.current = false;

      mesh.material.color.set(SUMMIT_SELECTED);
      mesh.material.emissive.setHex(0x241d47); // faint periwinkle-ink glow

      // Pick the featured attendee once per selection so it stays stable
      // while the popup tracks the rotating country.
      mesh.userData.featured = pickRandomAttendee(mesh.userData.iso2);
      updatePopupPosition(mesh);
    }

    function updatePopupPosition(mesh) {
      const centroid3D = mesh.userData.centroid3D.clone();
      centroid3D.applyMatrix4(globeGroup.matrixWorld);
      const projected = centroid3D.clone().project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      const sx = (projected.x * 0.5 + 0.5) * rect.width;
      const sy = (-projected.y * 0.5 + 0.5) * rect.height;
      const attendee = mesh.userData.featured;
      setSelected({
        name: mesh.userData.name,
        iso2: mesh.userData.iso2,
        feeds: mesh.userData.feeds,
        attendeeCount: mesh.userData.attendeeCount,
        attendee,
        screenX: sx,
        screenY: sy,
      });
    }

    function deselect() {
      if (selectedRef.current) {
        const prev = selectedRef.current;
        prev.material.color.copy(prev.userData.baseColor);
        prev.material.emissive.setHex(0x000000);
        selectedRef.current = null;
      }
      setSelected(null);
      rotatingRef.current = true;
    }

    // ---- Auto tour mode ----
    // Swings a random attendee country to face the camera dead-on, holds on
    // it for TOUR_DWELL_SECONDS, then picks the next one — a self-rescheduling
    // timeout chain (see scheduleTourTick) rather than a fixed interval, so
    // the dwell time is measured from when a country actually settles into
    // place, not from when the previous swing started. Unlike a manual click
    // (which freezes rotation), the globe keeps turning through and past
    // each stop — see animate(), which suspends only the *ambient* spin
    // increment while a tour tween is actively steering rotation.y/x, then
    // hands control straight back.
    const TOUR_DWELL_SECONDS = 12; // minimum time to stay on a selected country
    const TOUR_TWEEN_SECONDS = 1.8;
    const AMBIENT_ROTATION_SPEED = 0.06;
    const TOUR_DWELL_ROTATION_SPEED = 0.015; // slower while showing a stop's panel
    let tourTweening = false;
    let tourFromX = 0;
    let tourFromY = 0;
    let tourToX = 0;
    let tourToY = 0;
    let tourStartTime = 0;
    let tourMesh = null;
    let lastTourMesh = null;
    let tourTimeoutId = null;

    function scheduleTourTick(delaySeconds) {
      clearTimeout(tourTimeoutId);
      tourTimeoutId = setTimeout(runTourTick, delaySeconds * 1000);
    }

    // Heavily — but not exclusively — prefers a country on a different
    // continent than the last stop, so the tour reads as "touring the
    // world" rather than lingering around one region.
    const TOUR_CONTINENT_HOP_CHANCE = 0.85;
    function pickTourMesh(candidates) {
      if (!lastTourMesh) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
      const lastContinent = ISO2_TO_CONTINENT[lastTourMesh.userData.iso2];
      const otherContinent = candidates.filter(
        (m) => ISO2_TO_CONTINENT[m.userData.iso2] !== lastContinent,
      );
      const sameContinent = candidates.filter(
        (m) =>
          ISO2_TO_CONTINENT[m.userData.iso2] === lastContinent &&
          m !== lastTourMesh,
      );
      const pool =
        otherContinent.length &&
        (Math.random() < TOUR_CONTINENT_HOP_CHANCE || !sameContinent.length)
          ? otherContinent
          : sameContinent.length
            ? sameContinent
            : candidates;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function runTourTick() {
      if (!tourModeRef.current) return;
      const candidates = countryMeshesRef.current;
      if (!candidates.length) return;
      // Close the current stop's panel before swinging to the next one,
      // rather than leaving it visibly tracking/sliding during the tween.
      deselect();
      const mesh = pickTourMesh(candidates);
      lastTourMesh = mesh;

      // Solve, in the same independent-axis rotation model the manual drag
      // handler already uses (rotation.x and rotation.y driven separately
      // rather than a combined orbit), the globeGroup rotation that puts
      // this country's centroid dead-center facing the camera (+Z). The
      // unrotated point at lon=-90/lat=0 sits at local (0,0,+radius) — i.e.
      // already front-facing — so aligning any other point's local (x,z) to
      // that via a Y rotation, then its (y, z-projection) to it via an X
      // rotation, brings it to front-and-centered.
      const { x, y, z } = mesh.userData.centroid3D;
      const targetY = Math.atan2(-x, z);
      const z1 = Math.hypot(x, z);
      const targetX = Math.atan2(y, z1);

      tourFromX = globeGroup.rotation.x;
      tourFromY = globeGroup.rotation.y;
      tourToX = targetX;
      // rotation.y accumulates indefinitely under the ambient spin, so the
      // real target is "current plus the shortest turn", not the raw small
      // angle atan2 returns — otherwise the tween would wind the long way
      // around whenever accumulated rotation.y has wrapped past +-PI.
      tourToY =
        globeGroup.rotation.y + normalizeAngle(targetY - globeGroup.rotation.y);
      tourStartTime = starTimeRef.current;
      tourMesh = mesh;
      tourTweening = true;
    }
    runTourTickRef.current = runTourTick;

    // ---- Zoom via scroll wheel ----
    const MIN_ZOOM = 2.0;
    const MAX_ZOOM = 6.0;
    // The user's scroll-set distance. The camera's actual z each frame is
    // this plus a slow sinusoidal breathing offset (see animate()) — kept
    // separate so the two never fight over camera.position.z.
    let baseZoom = camera.position.z;
    function onWheel(event) {
      event.preventDefault();
      baseZoom += event.deltaY * 0.002;
      baseZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, baseZoom));
    }

    // ---- Slow "breathing" zoom ----
    const BREATHE_AMPLITUDE = 0.12; // small in/out range
    const BREATHE_SPEED = 0.12; // very slow — roughly a 52s in-and-out cycle

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    let raf;
    const clock = new THREE.Clock();
    function animate() {
      const dt = clock.getDelta();
      starTimeRef.current += dt;

      if (tourTweening) {
        const progress = Math.min(
          1,
          (starTimeRef.current - tourStartTime) / TOUR_TWEEN_SECONDS,
        );
        const e = easeInOutCubic(progress);
        globeGroup.rotation.x = tourFromX + (tourToX - tourFromX) * e;
        globeGroup.rotation.y = tourFromY + (tourToY - tourFromY) * e;
        if (progress >= 1) {
          tourTweening = false;
          selectCountry(tourMesh, { freezeRotation: false });
          scheduleTourTick(TOUR_DWELL_SECONDS);
        }
      } else if (rotatingRef.current) {
        // Ease off while a tour stop's panel is showing so there's time to
        // actually read it before it drifts off-center.
        const speed =
          tourModeRef.current && selectedRef.current
            ? TOUR_DWELL_ROTATION_SPEED
            : AMBIENT_ROTATION_SPEED;
        globeGroup.rotation.y += dt * speed;
      }
      if (selectedRef.current) updatePopupPosition(selectedRef.current);
      camera.position.z =
        baseZoom +
        Math.sin(starTimeRef.current * BREATHE_SPEED) * BREATHE_AMPLITUDE;
      for (const points of starLayersRef.current) {
        points.material.uniforms.uTime.value = starTimeRef.current;
        points.rotation.y = globeGroup.rotation.y * points.userData.parallax;
        points.rotation.x = globeGroup.rotation.x * points.userData.parallax;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(tourTimeoutId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      starTexture.dispose();
      starLayersRef.current = [];
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 500,
        background: 'transparent',
      }}
    >
      {/* Popup entrance animation */}
      <style>{`
        @keyframes summitPopIn {
          0% {
            opacity: 0;
            transform: translate(-50%, calc(-100% - 2px)) scale(0.82);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate(-50%, calc(-100% - 16px)) scale(1);
          }
        }
      `}</style>

      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: MD_INK_MUTED,
            fontFamily: MD_FONT_MONO,
            fontSize: 14,
            letterSpacing: '0.05em',
          }}
        >
          Loading summit globe…
        </div>
      )}
      {error && (
        <div
          style={{ position: 'absolute', top: 12, left: 12, color: '#b91c1c' }}
        >
          {error}
        </div>
      )}

      {/* Summit legend */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          zIndex: 3,
          background: MD_WHITE,
          border: `2px solid ${MD_PERIWINKLE}`,
          borderRadius: 4,
          padding: '8px 12px',
          fontFamily: MD_FONT_PROSE,
          color: MD_INK,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            fontFamily: MD_FONT_MONO,
            color: MD_PERIWINKLE,
          }}
        >
          Summit attendees
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 6,
            fontSize: 12,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: SUMMIT_COLOR,
              display: 'inline-block',
            }}
          />
          <span>
            {SUMMIT_ATTENDEES.length} attendees · {SUMMIT_COUNTRIES.size}{' '}
            countries
          </span>
        </div>
      </div>

      {selected && (
        <div
          key={`${selected.iso2}-${selected.attendee ? selected.attendee.id : 'none'}`}
          style={{
            position: 'absolute',
            left: selected.screenX,
            top: selected.screenY,
            transform: 'translate(-50%, calc(-100% - 16px))',
            transformOrigin: 'bottom center',
            animation: 'summitPopIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            pointerEvents: 'none',
            background: MD_WHITE,
            border: `2px solid ${MD_PERIWINKLE}`,
            borderRadius: 4,
            padding: '12px 14px',
            fontFamily: MD_FONT_PROSE,
            color: MD_INK,
            width: 260,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.08em',
              fontFamily: MD_FONT_MONO,
              color: MD_PERIWINKLE,
            }}
          >
            {selected.name}
          </div>

          {selected.attendee ? (
            <div
              style={{
                display: 'flex',
                gap: 12,
                marginTop: 8,
                alignItems: 'center',
              }}
            >
              <AgencyLogo
                domain={selected.attendee.domain}
                agency={selected.attendee.agency}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: MD_PERIWINKLE,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {selected.attendee.name}
                </div>
                <div style={{ fontSize: 13, color: MD_INK, marginTop: 1 }}>
                  {selected.attendee.agency}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: MD_INK_MUTED,
                    marginTop: 1,
                    fontFamily: MD_FONT_MONO,
                  }}
                >
                  {selected.attendee.municipality}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginTop: 6,
                color: MD_INK,
              }}
            >
              No summit attendees
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              marginTop: 12,
              paddingTop: 10,
              borderTop: `1px solid ${MD_PERIWINKLE_SOFT}`,
              fontSize: 12,
              fontFamily: MD_FONT_MONO,
              color: MD_INK_MUTED,
            }}
          >
            <div>
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  color: MD_PERIWINKLE,
                  fontSize: 15,
                }}
              >
                {selected.feeds.toLocaleString()}
              </span>{' '}
              {selected.feeds === 1 ? 'feed' : 'feeds'}
            </div>
            <div>
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  color: MD_PERIWINKLE,
                  fontSize: 15,
                }}
              >
                {selected.attendeeCount}
              </span>{' '}
              {selected.attendeeCount === 1 ? 'attendee' : 'attendees'}
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: -6,
              transform: 'translateX(-50%) rotate(45deg)',
              width: 10,
              height: 10,
              background: MD_WHITE,
              borderRight: `2px solid ${MD_PERIWINKLE}`,
              borderBottom: `2px solid ${MD_PERIWINKLE}`,
            }}
          />
        </div>
      )}
      {allowFullscreen && !isFullscreen && (
        <button
          type='button'
          onClick={() => {
            if (!rendererRef.current) return;
            requestFullscreenForElement(rendererRef.current.domElement);
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = MD_PERIWINKLE;
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(23, 10, 46, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = MD_INK;
            e.currentTarget.style.boxShadow =
              '0 4px 10px rgba(23, 10, 46, 0.25)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translateY(2px)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            zIndex: 3,
            background: MD_INK,
            color: MD_WHITE,
            border: 'none',
            borderRadius: 4,
            padding: '8px 14px',
            fontFamily: MD_FONT_MONO,
            fontSize: 12,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(23, 10, 46, 0.25)',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
          }}
          aria-label='Enter fullscreen globe'
        >
          Fullscreen
        </button>
      )}
      <button
        type='button'
        onClick={() => {
          setTourMode((prev) => {
            const next = !prev;
            tourModeRef.current = next;
            if (next) runTourTickRef.current();
            return next;
          });
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = MD_PERIWINKLE;
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(23, 10, 46, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = MD_INK;
          e.currentTarget.style.boxShadow = '0 4px 10px rgba(23, 10, 46, 0.25)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'translateY(2px)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          zIndex: 3,
          background: MD_INK,
          color: MD_WHITE,
          border: 'none',
          borderRadius: 4,
          padding: '8px 14px',
          fontFamily: MD_FONT_MONO,
          fontSize: 12,
          letterSpacing: '0.02em',
          cursor: 'pointer',
          boxShadow: '0 4px 10px rgba(23, 10, 46, 0.25)',
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
        }}
        aria-label={tourMode ? 'Stop auto tour' : 'Start auto tour'}
        aria-pressed={tourMode}
      >
        {tourMode ? 'Stop tour' : 'Auto tour'}
      </button>
    </div>
  );
}

function buildCountries(geo, globeGroup, radius, meshesRef) {
  const meshes = [];
  for (const feat of geo.features) {
    const numId = String(feat.id).padStart(3, '0');
    const iso2 = NUM_TO_ISO2[numId];
    const name =
      (feat.properties && feat.properties.name) ||
      ISO2_TO_NAME_FALLBACK[iso2] ||
      iso2 ||
      'Unknown';
    const feeds = iso2 && FEED_DATA[iso2] ? FEED_DATA[iso2] : 0;
    const hasAttendees = iso2 && SUMMIT_COUNTRIES.has(iso2);
    const attendeeCount = hasAttendees ? ATTENDEES_BY_COUNTRY[iso2].length : 0;

    // Equal flat shade for every summit country; faded otherwise.
    const baseColor = new THREE.Color(
      hasAttendees ? SUMMIT_COLOR : SUMMIT_INACTIVE,
    );

    const polys =
      feat.geometry.type === 'Polygon'
        ? [feat.geometry.coordinates]
        : feat.geometry.coordinates;

    const outerRings = polys.map((rings) => rings[0]).filter(Boolean);

    // Skip pole-encircling features (Antarctica). Its ring winds a full ±360°
    // around the south pole; triangulating it produces a polar-cap fill whose
    // boundary renders as a smooth ring that looks like a false equator. It has
    // no transit relevance, so we omit it entirely (fill and border).
    if (outerRings.some(ringEncirclesPole)) continue;
    const [clon, clat] = polygonCentroid(outerRings);
    const centroid3D = lonLatToVec3(clon, clat, radius * 1.02);

    const geoms = [];
    for (const rings of polys) {
      const g = polygonToSphereGeometry(rings, radius, 2);
      if (g) geoms.push(g);
    }
    if (!geoms.length) continue;

    const merged = mergeGeometries(geoms);
    const mat = new THREE.MeshPhongMaterial({
      color: baseColor.clone(),
      // A white emissive + low opacity here used to wash every non-attendee
      // country toward white regardless of baseColor — which is why
      // changing SUMMIT_INACTIVE's hex appeared to do nothing. Both are
      // gone now so the actual fill color (SUMMIT_COLOR / SUMMIT_INACTIVE)
      // reads at full strength.
      emissive: 0x000000,
      shininess: hasAttendees ? 6 : 2,
      specular: hasAttendees ? 0x111122 : 0xeeeeee,
      side: THREE.DoubleSide,
      // Opaque: transparent fills sort per-object and blink at the limb as
      // the globe rotates.
      transparent: false,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.userData = {
      iso2: iso2 || '??',
      name,
      feeds,
      attendeeCount,
      baseColor: baseColor.clone(),
      centroid3D,
      featured: null,
    };
    globeGroup.add(mesh);
    // Only summit countries are clickable.
    if (hasAttendees) meshes.push(mesh);

    // Border outlines — 2px periwinkle line-work (the brand's core motif).
    for (const rings of polys) {
      const outer = rings[0];
      if (!outer || outer.length < 2) continue;
      const pts = outer.map(([lon, lat]) =>
        lonLatToVec3(lon, lat, radius * 1.001),
      );
      const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x96a1ff, // periwinkle
        transparent: false, // opaque so borders don't blink at the limb
      });
      globeGroup.add(new THREE.Line(lineGeom, lineMat));
    }
  }
  meshesRef.current = meshes;
}

function mergeGeometries(geoms) {
  let total = 0;
  for (const g of geoms) total += g.attributes.position.count;
  const positions = new Float32Array(total * 3);
  let offset = 0;
  for (const g of geoms) {
    const arr = g.attributes.position.array;
    positions.set(arr, offset);
    offset += arr.length;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  merged.computeVertexNormals();
  return merged;
}
