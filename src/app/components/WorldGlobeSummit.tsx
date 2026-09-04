// @ts-nocheck
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import earcut from 'earcut';
import {
  ATTENDEES_BY_COUNTRY,
  SUMMIT_ATTENDEES,
  SUMMIT_CITIES,
  SUMMIT_COUNTRIES,
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

// MobilityData is headquartered in Montreal — the summit's host city, and the
// convergence point for the attendee arcs drawn on the globe.
const MONTREAL_LON = -73.5673;
const MONTREAL_LAT = 45.5017;

// Height (as a multiple of the globe's own radius) shared by the city dots,
// the attendee arcs' starting point, and the popup anchor — so all three
// sit exactly together rather than drifting apart via separately-tuned
// constants.
const CITY_MARKER_RADIUS_SCALE = 1.005;

// Municipality name -> city record, for anchoring a country's popup on the
// featured attendee's actual city rather than the country's geometric
// centroid.
const CITY_BY_MUNICIPALITY = new Map(
  SUMMIT_CITIES.map((city) => [city.municipality, city]),
);

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
    count: 140,
    radiusMin: 5,
    radiusMax: 7,
    size: 3,
    opacity: 0.55,
    parallax: 0.05,
  },
  {
    count: 90,
    radiusMin: 1,
    radiusMax: 8,
    size: 1.5,
    opacity: 0.4,
    parallax: 0.1,
  },
  {
    count: 40,
    radiusMin: 2,
    radiusMax: 10,
    size: 2,
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

// Spherical linear interpolation between two unit directions — the great-
// circle midpoint between them, not a straight-line lerp (which would cut
// through the globe).
function slerpDirection(a, b, t) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const theta = Math.acos(dot);
  if (theta < 1e-6) return a.clone();
  const sinTheta = Math.sin(theta);
  const w1 = Math.sin((1 - t) * theta) / sinTheta;
  const w2 = Math.sin(t * theta) / sinTheta;
  return a.clone().multiplyScalar(w1).add(b.clone().multiplyScalar(w2));
}

// Builds a flight-path-style arc between two points on the globe's surface:
// it follows the great-circle path (via slerpDirection) but lifts off the
// surface by an amount that peaks at the midpoint and scales with how far
// apart the two points are, so distant countries arc higher than nearby ones.
function buildArcPoints(fromDir, toDir, baseRadius, segments = 48) {
  const theta = Math.acos(THREE.MathUtils.clamp(fromDir.dot(toDir), -1, 1));
  const arcHeight = 0.05 + theta * 0.15;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const dir = slerpDirection(fromDir, toDir, t);
    const r = baseRadius + arcHeight * Math.sin(Math.PI * t);
    points.push(dir.multiplyScalar(r));
  }
  return points;
}

// WebGL caps plain THREE.Line width at 1px on most platforms regardless of
// `material.linewidth`, so real thickness needs actual geometry: a
// cylindrical tube (a ring of vertices around each centerline point) rather
// than a single-pixel polyline.
const ARC_TUBE_RADIUS = 0.0015; // world units, on a globe of radius 1 -- line thickness
const ARC_TUBE_SEGMENTS = 6; // vertices per ring — hexagonal cross-section
const ARC_HIGHLIGHT_COLOR = '#ff3b30'; // solid red for the selected country's arc

// Mirrors the TRAVEL_SPAN/SETTLE_SPAN/PERIOD constants inside
// createAttendeeArc's fragment shader (the comet's own travel/hold/restart
// cycle) — kept here in JS too so the city dots' departure pulse (see
// animate()) can compute the exact same cycle position without re-running
// the shader.
const ARC_TRAVEL_SPAN = 1.0;
const ARC_SETTLE_SPAN = 0.4;
const ARC_PERIOD = ARC_TRAVEL_SPAN + ARC_SETTLE_SPAN;
// How long, in the same cycle units as above, a city dot's departure pulse
// takes to decay back to its normal ambient breathing.
const CITY_DEPART_PULSE_WINDOW = 0.18;

// Builds a tube around the arc's centerline. At each point the local frame
// (n1, n2) is derived from the tangent and the sphere's own radial
// direction rather than a Frenet frame, so it can't twist/flip along the
// curve the way Frenet frames do near inflection points.
function buildTubeGeometry(points, radius, segments) {
  const last = points.length - 1;
  const positions = new Float32Array(points.length * segments * 3);
  const ts = new Float32Array(points.length * segments);

  for (let i = 0; i <= last; i++) {
    const p = points[i];
    const prev = points[Math.max(i - 1, 0)];
    const next = points[Math.min(i + 1, last)];
    const tangent = next.clone().sub(prev).normalize();
    const radial = p.clone().normalize();
    const n1 = tangent.clone().cross(radial).normalize();
    const n2 = n1.clone().cross(tangent).normalize();
    const t = i / last;

    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const vertex = p
        .clone()
        .addScaledVector(n1, Math.cos(theta) * radius)
        .addScaledVector(n2, Math.sin(theta) * radius);
      const idx = (i * segments + j) * 3;
      positions[idx] = vertex.x;
      positions[idx + 1] = vertex.y;
      positions[idx + 2] = vertex.z;
      ts[i * segments + j] = t;
    }
  }

  const indices = [];
  for (let i = 0; i < last; i++) {
    for (let j = 0; j < segments; j++) {
      const jNext = (j + 1) % segments;
      const a = i * segments + j;
      const b = i * segments + jNext;
      const c = (i + 1) * segments + j;
      const d = (i + 1) * segments + jNext;
      indices.push(a, c, b, b, c, d);
    }
  }

  return { positions, ts, indices };
}

// One arc with a faint static guide tube plus a bright comet that travels
// from its country of origin (t=0) to Montreal (t=1). On arrival it doesn't
// just vanish — it holds and gently fades at the destination (as if
// settling into the globe there) before the next comet sets off. uPhase and
// uSpeed are randomized per arc so the comets don't all move in lockstep.
function createAttendeeArc(fromDir, toDir, baseRadius, color) {
  const points = buildArcPoints(fromDir, toDir, baseRadius);
  const { positions, ts, indices } = buildTubeGeometry(
    points,
    ARC_TUBE_RADIUS,
    ARC_TUBE_SEGMENTS,
  );

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
  geom.setIndex(indices);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHighlightColor: { value: new THREE.Color(ARC_HIGHLIGHT_COLOR) },
      uTime: { value: 0 },
      uPhase: { value: Math.random() },
      uSpeed: { value: 0.05 + Math.random() * 0.03 }, // speed of animation
      // 0 normally; set to 1 while this arc's country is the tour/click
      // selection, turning the entire path solid red.
      uHighlight: { value: 0 },
    },
    vertexShader: `
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHighlightColor;
      uniform float uTime;
      uniform float uPhase;
      uniform float uSpeed;
      uniform float uHighlight;
      varying float vT;
      void main() {
        // Faint static line, brighter toward Montreal — a subtle guide even
        // when the comet is elsewhere on the arc. Highlighted (selected)
        // arcs go fully solid instead — the whole path lit red end to end.
        float base = smoothstep(0.0, 0.35, vT) * mix(0.04, 0.16, vT);
        base = mix(base, 1.0, uHighlight);

        // The comet spends TRAVEL_SPAN units of time crossing the arc, then
        // SETTLE_SPAN units holding and fading at Montreal before the cycle
        // restarts — so arrival reads as settling into the destination
        // rather than an abrupt cut.
        const float TRAVEL_SPAN = ${ARC_TRAVEL_SPAN.toFixed(4)};
        const float SETTLE_SPAN = ${ARC_SETTLE_SPAN.toFixed(4)};
        const float PERIOD = TRAVEL_SPAN + SETTLE_SPAN;
        float cycle = mod(uTime * uSpeed + uPhase * PERIOD, PERIOD);
        float head = clamp(cycle / TRAVEL_SPAN, 0.0, 1.0);
        float settle = clamp((cycle - TRAVEL_SPAN) / SETTLE_SPAN, 0.0, 1.0);
        float fadeOut = 1.0 - settle;

        float behind = head - vT;
        // Trail glow only behind the head (behind >= 0); nothing ahead of
        // it, since the comet hasn't reached those points yet this lap.
        float trail = behind >= 0.0 ? exp(-behind * 9.0) : 0.0;
        float core = smoothstep(0.025, 0.0, abs(behind));
        float pulse = (trail * 0.7 + core) * fadeOut;

        float alpha = clamp(base + pulse, 0.0, 1.0);
        vec3 color = mix(uColor, uHighlightColor, uHighlight);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  // The transparent ocean sphere doesn't write depth until its turn in the
  // (distance-sorted) transparent render pass, which can land after a
  // far-side arc — one whose corresponding near-side screen pixel is open
  // ocean rather than a country polygon — letting it show through where it
  // should be hidden behind the globe. A higher renderOrder forces the
  // ocean to always draw first.
  mesh.renderOrder = 1;
  return mesh;
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

// A pulsating white dot per attendee city (added to globeGroup, so unlike
// the parallaxed star layers above these rotate with the globe like any
// other surface marker). Each dot gets a random phase so they breathe out
// of sync with one another.
function createCityDots(cities, radius) {
  const count = cities.length;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  // Departure pulse strength, one per city — 0 normally, driven up to 1 by
  // animate() the instant that city's arc (see buildAttendeeArcs, which
  // builds arcs from this same `cities` array in the same order) sends off
  // a new comet, then left to decay back to 0 over CITY_DEPART_PULSE_WINDOW.
  // A plain (non-dynamic) attribute would still work, but marking it
  // DynamicDrawUsage hints to the driver that this buffer is rewritten
  // every frame rather than once at creation.
  const pulseBoosts = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const city = cities[i];
    const v = lonLatToVec3(
      city.lon,
      city.lat,
      radius * CITY_MARKER_RADIUS_SCALE,
    );
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  const pulseBoostAttr = new THREE.Float32BufferAttribute(pulseBoosts, 1);
  pulseBoostAttr.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('aPulseBoost', pulseBoostAttr);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ffffff') },
      // A fixed, small screen-space size — coin-sized, not distance-scaled
      // the way the star shells are (that factor is tuned for points 5-10
      // world-units out; at this marker's radius-~1 distance from camera
      // it blew the dots up into huge glowing blobs).
      uBaseSize: { value: 4 },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aPulseBoost;
      uniform float uTime;
      uniform float uBaseSize;
      varying float vPulse;
      varying float vDepartPulse;
      void main() {
        vPulse = 0.5 + 0.5 * sin(uTime * 2.0 + aPhase);
        vDepartPulse = aPulseBoost;
        // The departure pulse briefly grows the dot on top of its normal
        // ambient breathing, so the moment reads as a distinct "pop" rather
        // than just a brighter version of the idle animation.
        gl_PointSize =
          uBaseSize * (0.85 + 0.15 * vPulse) * (1.0 + aPulseBoost * 1.6);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vPulse;
      varying float vDepartPulse;
      void main() {
        // A crisp, near-solid coin — a thin antialiased edge, not a soft glow.
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv) * 2.0;
        float shape = smoothstep(1.0, 0.85, dist);
        float alpha = shape * (0.75 + 0.25 * vPulse);
        alpha = clamp(alpha + vDepartPulse * 0.6, 0.0, 1.0);
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  return new THREE.Points(geom, mat);
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

// Converts an ISO 3166-1 alpha-2 code to its flag emoji via regional
// indicator symbols (each letter maps to U+1F1E6..U+1F1FF).
function iso2ToFlagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '';
  const codePoints = [...iso2.toUpperCase()].map(
    (c) => 127397 + c.charCodeAt(0),
  );
  return String.fromCodePoint(...codePoints);
}

// ---------- Component ----------
export default function WorldGlobeSummit({
  allowFullscreen = false,
}: {
  allowFullscreen?: boolean;
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const globeGroupRef = useRef(null);
  const rotatingRef = useRef(true);
  const countryMeshesRef = useRef([]);
  const selectedRef = useRef(null);
  const starLayersRef = useRef([]);
  const arcLinesRef = useRef([]);
  const arcsByMunicipalityRef = useRef({});
  const cityDotsRef = useRef(null);
  const starTimeRef = useRef(0);
  const tourModeRef = useRef(false);
  const runTourTickRef = useRef(() => {});
  // The popup's screen position is written straight to the DOM every frame
  // (see updatePopupPosition) instead of through React state, so the
  // globe's per-frame rotation doesn't force a re-render of the whole
  // component 60x/second — only its content (which country/attendee) goes
  // through setSelected, and only when that content actually changes.
  const popupElRef = useRef(null);
  const popupPosRef = useRef({ x: 0, y: 0 });
  const lastSelectionKeyRef = useRef(null);
  // Canvas size, cached so updatePopupPosition doesn't call
  // getBoundingClientRect() every animation frame — that forces a
  // synchronous layout recalculation, since the previous frame just wrote
  // to this same popup's style. Kept in sync by onResize, which is the
  // only thing that actually changes it.
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  // The permanent Montreal marker, positioned and shown/hidden every frame
  // the same ref-driven way as the popup above — see animate().
  const montrealMarkerElRef = useRef(null);
  const montrealMarkerPosRef = useRef({ x: 0, y: 0, visible: false });

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
    canvasSizeRef.current = { width, height };
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.style.touchAction = 'none';
    // The canvas clears to alpha 0 so it blends with the page behind it.
    // A fullscreen element renders on the browser's own black backdrop
    // instead of the page, so the canvas's own CSS background must match
    // the page's off-white surface or fullscreen mode looks like it went
    // black.
    renderer.domElement.style.background = '#f7f7f7';
    container.appendChild(renderer.domElement);

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

    // Near-white globe body, kept slightly translucent for a hint of glass.
    // Unlit (Basic, not Phong): a lit material shades this dimmer on the
    // side facing away from the key/fill lights, which read as the ocean
    // looking grey rather than white — Basic ignores scene lighting
    // entirely, so it stays flat white all the way round. Structure still
    // comes from the periwinkle line-work on top, not from ocean shading.
    const oceanGeom = new THREE.SphereGeometry(OCEAN_RADIUS, 64, 64);
    const oceanMat = new THREE.MeshBasicMaterial({
      color: 0xbfc9ed, //#5f64a0
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

    // Pulsating city markers and attendee arcs — placed directly, since
    // both only need the agency catalogue's municipality coordinates, not
    // the country topology fetched below.
    const cityDots = createCityDots(SUMMIT_CITIES, COUNTRY_RADIUS);
    // Same reasoning as the attendee arcs' renderOrder: without it, a
    // far-side dot behind open ocean can be distance-sorted ahead of the
    // (also transparent) ocean sphere and render before its depth is
    // written, making the dot appear to float off the globe instead of
    // being hidden behind it.
    cityDots.renderOrder = 1;
    globeGroup.add(cityDots);
    cityDotsRef.current = cityDots;

    arcLinesRef.current = buildAttendeeArcs(
      globeGroup,
      COUNTRY_RADIUS,
      SUMMIT_CITIES,
    );
    const byMunicipality = {};
    for (const arc of arcLinesRef.current) {
      byMunicipality[arc.userData.municipality] = arc;
    }
    arcsByMunicipalityRef.current = byMunicipality;

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

    // Scratch vectors reused every frame by updatePopupPosition and
    // updateMontrealMarker, instead of `.clone()`-ing new ones each call —
    // at 60fps the per-frame allocations were enough churn (and resulting
    // GC pauses) to read as choppy on top of the animation itself.
    const popupAnchorScratch = new THREE.Vector3();
    const popupProjectedScratch = new THREE.Vector3();
    const montrealAnchorScratch = new THREE.Vector3();
    const montrealNormalScratch = new THREE.Vector3();
    const montrealCameraDirScratch = new THREE.Vector3();
    const montrealProjectedScratch = new THREE.Vector3();
    // Montreal's own lat/lon never changes — only its transformed
    // world-space position does (via globeGroup's rotation) — so this is
    // computed once here rather than every frame inside updateMontrealMarker.
    const montrealLocal = lonLatToVec3(
      MONTREAL_LON,
      MONTREAL_LAT,
      COUNTRY_RADIUS * CITY_MARKER_RADIUS_SCALE,
    );
    // Tracks the last value actually written to the marker's `visibility`,
    // so animate() only touches that style property on the frame it
    // changes instead of redundantly every frame.
    let montrealMarkerVisible = null;

    function handleFullscreenChange() {
      const nowFullscreen = document.fullscreenElement === container;
      setIsFullscreen(nowFullscreen);
      if (nowFullscreen && !tourModeRef.current) {
        tourModeRef.current = true;
        setTourMode(true);
        runTourTickRef.current();
      }
    }

    function toggleFullscreen() {
      // The container (not the canvas) is the fullscreen target so the
      // React-rendered overlays — banner, legend, popup, buttons — which
      // are DOM siblings of the canvas, stay visible: only descendants of
      // the fullscreen element are shown while it's active.
      if (document.fullscreenElement === container) {
        exitFullscreenDocument();
      } else {
        requestFullscreenForElement(container);
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

    function setArcHighlight(municipality, value) {
      const arc = arcsByMunicipalityRef.current[municipality];
      if (arc) arc.material.uniforms.uHighlight.value = value;
    }

    function selectCountry(
      mesh,
      { freezeRotation = true, featured = null } = {},
    ) {
      if (selectedRef.current && selectedRef.current !== mesh) {
        const prev = selectedRef.current;
        prev.material.color.copy(prev.userData.baseColor);
        prev.material.emissive.setHex(0x000000);
        if (prev.userData.featured) {
          setArcHighlight(prev.userData.featured.municipality, 0);
        }
      }
      selectedRef.current = mesh;
      // Tour mode drives the globe itself (see runTourTick) and wants it to
      // keep turning through each stop rather than parking on it the way a
      // manual click does.
      if (freezeRotation) rotatingRef.current = false;

      mesh.material.color.set(SUMMIT_SELECTED);
      mesh.material.emissive.setHex(0x241d47); // faint periwinkle-ink glow

      // Pick the featured attendee once per selection so it stays stable
      // while the popup tracks the rotating country — the highlighted arc
      // and the popup anchor (see updatePopupPosition) both follow this
      // specific attendee's city, not the country as a whole. Tour mode
      // passes its own pre-chosen attendee (see runTourTick) so the camera
      // swing, popup, and highlight all agree on the same city; manual
      // clicks pick fresh here.
      mesh.userData.featured =
        featured ?? pickRandomAttendee(mesh.userData.iso2);
      if (mesh.userData.featured) {
        setArcHighlight(mesh.userData.featured.municipality, 1);
      }
      // Cached here (once per selection) rather than recomputed every
      // frame inside updatePopupPosition — the featured attendee's city
      // doesn't change while this selection is showing, only the popup's
      // projected screen position does as the globe turns.
      const featuredCity = mesh.userData.featured
        ? CITY_BY_MUNICIPALITY.get(mesh.userData.featured.municipality)
        : null;
      mesh.userData.popupAnchorLocal = featuredCity
        ? lonLatToVec3(
            featuredCity.lon,
            featuredCity.lat,
            COUNTRY_RADIUS * CITY_MARKER_RADIUS_SCALE,
          )
        : mesh.userData.centroid3D;
      updatePopupPosition(mesh);
    }

    // Keeps the permanent Montreal marker glued to Montreal's spot on the
    // globe and hidden whenever that spot has rotated round to the far
    // side — same front-facing test as the click raycast's frontHit check
    // (surface normal vs. camera direction), just evaluated directly for
    // this one fixed point instead of via a raycast hit.
    function updateMontrealMarker() {
      montrealAnchorScratch
        .copy(montrealLocal)
        .applyMatrix4(globeGroup.matrixWorld);
      montrealNormalScratch.copy(montrealAnchorScratch).normalize();
      montrealCameraDirScratch
        .copy(camera.position)
        .sub(montrealAnchorScratch)
        .normalize();
      const facing = montrealNormalScratch.dot(montrealCameraDirScratch);

      montrealProjectedScratch.copy(montrealAnchorScratch).project(camera);
      const { width, height } = canvasSizeRef.current;
      // Not rounded — see the matching comment in updatePopupPosition:
      // integer-snapping this reads as stair-stepping rather than smooth
      // motion, more so the higher the display's refresh rate.
      const sx = (montrealProjectedScratch.x * 0.5 + 0.5) * width;
      const sy = (-montrealProjectedScratch.y * 0.5 + 0.5) * height;
      // Fades in/out over a small window around the horizon instead of
      // popping, but is fully hidden (rather than just faint) once
      // Montreal is more than a hair past the edge.
      const opacity = THREE.MathUtils.clamp(facing * 8, 0, 1);
      const visible = facing > 0;

      montrealMarkerPosRef.current = { x: sx, y: sy, visible };
      const el = montrealMarkerElRef.current;
      if (el) {
        el.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
        el.style.opacity = opacity.toFixed(3);
        // Only touched on the frame it actually flips, rather than every
        // frame regardless of value — one less style write in the common
        // case where Montreal stays on the same side for many frames.
        if (visible !== montrealMarkerVisible) {
          el.style.visibility = visible ? 'visible' : 'hidden';
          montrealMarkerVisible = visible;
        }
      }
    }

    function updatePopupPosition(mesh) {
      const featured = mesh.userData.featured;
      // mesh.userData.popupAnchorLocal is set once per selection (see
      // selectCountry) rather than recomputed here — this runs every
      // animation frame, and re-deriving it (plus the .clone()s this used
      // to do) on each call was allocating enough per frame to read as
      // choppy on its own, on top of the animation itself.
      popupAnchorScratch
        .copy(mesh.userData.popupAnchorLocal)
        .applyMatrix4(globeGroup.matrixWorld);
      popupProjectedScratch.copy(popupAnchorScratch).project(camera);
      const projected = popupProjectedScratch;
      // Cached by onResize instead of calling getBoundingClientRect() here:
      // this runs every animation frame, and a geometry read right after
      // the DOM write below would otherwise force a synchronous layout
      // recalculation each frame (classic layout thrashing).
      const { width, height } = canvasSizeRef.current;
      // Deliberately NOT rounded to whole pixels: on a high-refresh-rate
      // display (100Hz+), the globe advances well under a pixel in most
      // frames, so integer-snapping made the popup sit at the same rounded
      // position for several frames in a row and then jump — a stair-step
      // that reads as choppy, and reads *worse* the higher the refresh
      // rate (more "held" frames between each jump). `willChange:
      // 'transform'` on the outer div (see JSX) already promotes it to its
      // own compositor layer, so the browser resamples that layer's
      // already-rasterized content at sub-pixel offsets via the GPU rather
      // than re-rasterizing the text each frame — sub-pixel positioning
      // stays smooth and cheap without needing to snap to whole pixels.
      const sx = (projected.x * 0.5 + 0.5) * width;
      const sy = (-projected.y * 0.5 + 0.5) * height;

      // Written directly to the DOM (bypassing React) so tracking the
      // rotating globe every animation frame doesn't also re-render the
      // whole popup 60x/second — that's what was making the dialog choppy
      // while the globe spins. popupPosRef also backs the popup's own
      // initial inline style (see JSX below) so it's correctly placed the
      // instant it mounts, before the next animation frame runs. Using
      // `transform: translate3d` rather than `left`/`top` keeps these
      // updates on the compositor instead of forcing layout + paint of the
      // popup on the main thread every frame — the same reason the Three.js
      // canvas itself stays smooth.
      popupPosRef.current = { x: sx, y: sy };
      if (popupElRef.current) {
        popupElRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      }

      // Only push through React state — which re-renders the popup's
      // content — when the actual selection (country + featured attendee)
      // changes, not on every position update.
      const selectionKey = `${mesh.userData.iso2}-${featured ? featured.id : 'none'}`;
      if (selectionKey === lastSelectionKeyRef.current) return;
      lastSelectionKeyRef.current = selectionKey;

      setSelected({
        name: mesh.userData.name,
        iso2: mesh.userData.iso2,
        feeds: mesh.userData.feeds,
        attendeeCount: mesh.userData.attendeeCount,
        attendee: featured,
      });
    }

    function deselect() {
      if (selectedRef.current) {
        const prev = selectedRef.current;
        prev.material.color.copy(prev.userData.baseColor);
        prev.material.emissive.setHex(0x000000);
        if (prev.userData.featured) {
          setArcHighlight(prev.userData.featured.municipality, 0);
        }
        selectedRef.current = null;
      }
      lastSelectionKeyRef.current = null;
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
    let tourFeatured = null;
    let lastTourMesh = null;
    let tourTimeoutId = null;
    // How many times each agency has already been featured during this
    // tour — used to weight it down relative to agencies not yet shown, so
    // the tour surfaces a variety of attendees instead of repeatedly
    // landing on whichever one happens to win the country's coin flip.
    const tourAgencyShownCount = new Map();

    // Weighted pick within a country's attendee list: an agency's weight
    // halves each time it has already been featured, so it grows steadily
    // less likely to come up again relative to agencies not yet shown.
    function pickTourAttendee(iso2) {
      const list = ATTENDEES_BY_COUNTRY[iso2];
      if (!list || !list.length) return null;
      const weights = list.map(
        (a) => 1 / (1 + (tourAgencyShownCount.get(a.agency) || 0)),
      );
      const total = weights.reduce((sum, w) => sum + w, 0);
      let r = Math.random() * total;
      for (let i = 0; i < list.length; i++) {
        r -= weights[i];
        if (r <= 0) return list[i];
      }
      return list[list.length - 1];
    }

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

      // Picked here — before the tween's target is solved — rather than
      // inside selectCountry, so the swing centers on this specific
      // attendee's city instead of the country as a whole. selectCountry
      // (called once the tween lands) reuses this same attendee so the
      // popup and highlighted arc match what the camera actually centered
      // on.
      tourFeatured = pickTourAttendee(mesh.userData.iso2);
      if (tourFeatured) {
        tourAgencyShownCount.set(
          tourFeatured.agency,
          (tourAgencyShownCount.get(tourFeatured.agency) || 0) + 1,
        );
      }
      const city = tourFeatured
        ? CITY_BY_MUNICIPALITY.get(tourFeatured.municipality)
        : null;
      const cityDir = city
        ? lonLatToVec3(city.lon, city.lat, 1)
        : mesh.userData.centroid3D;

      // Solve, in the same independent-axis rotation model the manual drag
      // handler already uses (rotation.x and rotation.y driven separately
      // rather than a combined orbit), the globeGroup rotation that puts
      // the city dead-center facing the camera (+Z). The unrotated point at
      // lon=-90/lat=0 sits at local (0,0,+radius) — i.e. already
      // front-facing — so aligning any other point's local (x,z) to that
      // via a Y rotation, then its (y, z-projection) to it via an X
      // rotation, brings it to front-and-centered.
      const { x, y, z } = cityDir;
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
      canvasSizeRef.current = { width: w, height: h };
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
          selectCountry(tourMesh, {
            freezeRotation: false,
            featured: tourFeatured,
          });
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
      updateMontrealMarker();
      camera.position.z =
        baseZoom +
        Math.sin(starTimeRef.current * BREATHE_SPEED) * BREATHE_AMPLITUDE;
      for (const points of starLayersRef.current) {
        points.material.uniforms.uTime.value = starTimeRef.current;
        points.rotation.y = globeGroup.rotation.y * points.userData.parallax;
        points.rotation.x = globeGroup.rotation.x * points.userData.parallax;
      }
      // buildAttendeeArcs builds one arc per SUMMIT_CITIES entry, in that
      // same order, so arcLinesRef.current[i] is always that same city's
      // arc — no name lookup needed to keep the two in sync index-for-index.
      const pulseBoostAttr =
        cityDotsRef.current?.geometry.attributes.aPulseBoost;
      for (let i = 0; i < arcLinesRef.current.length; i++) {
        const arc = arcLinesRef.current[i];
        arc.material.uniforms.uTime.value = starTimeRef.current;
        if (pulseBoostAttr) {
          const { uPhase, uSpeed } = arc.material.uniforms;
          // Mirrors the comet's own cycle math in createAttendeeArc's
          // fragment shader: cycle wraps to 0 exactly when a new comet
          // departs this arc's origin city, so a short decay from there
          // pulses the city dot in time with the departure.
          const cycle =
            (starTimeRef.current * uSpeed.value + uPhase.value * ARC_PERIOD) %
            ARC_PERIOD;
          pulseBoostAttr.array[i] =
            cycle < CITY_DEPART_PULSE_WINDOW
              ? Math.pow(1 - cycle / CITY_DEPART_PULSE_WINDOW, 2)
              : 0;
        }
      }
      if (cityDotsRef.current) {
        cityDotsRef.current.material.uniforms.uTime.value = starTimeRef.current;
        if (pulseBoostAttr) pulseBoostAttr.needsUpdate = true;
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
      arcLinesRef.current = [];
      arcsByMunicipalityRef.current = {};
      cityDotsRef.current = null;
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
        // In fullscreen the container itself sits on the browser's own
        // black backdrop, so it needs an explicit background to match the
        // page instead of staying transparent.
        background: isFullscreen ? '#f7f7f7' : 'transparent',
      }}
    >
      {/* Popup entrance animation */}
      <style>{`
        @keyframes summitPopIn {
          0% {
            opacity: 0;
            transform: translate(-50%, calc(-100% - 3px)) scale(0.82);
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate(-50%, calc(-100% - 20px)) scale(1);
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
          left: 16,
          bottom: 16,
          zIndex: 3,
          background: MD_WHITE,
          border: `2px solid ${MD_PERIWINKLE}`,
          borderRadius: 6,
          padding: '14px 20px',
          fontFamily: MD_FONT_PROSE,
          color: MD_INK,
        }}
      >
        <div
          style={{
            fontSize: 14,
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
            gap: 10,
            marginTop: 8,
            fontSize: 16,
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
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

      {/* Permanent Montreal marker — MobilityData's HQ and the summit's
          host city. Always mounted; updateMontrealMarker() (in animate())
          moves it every frame and fades/hides it via opacity + visibility
          once Montreal has rotated to the globe's far side, the same way
          the click raycast decides a hit is front-facing. */}
      <div
        ref={montrealMarkerElRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate3d(${montrealMarkerPosRef.current.x}px, ${montrealMarkerPosRef.current.y}px, 0)`,
          opacity: 0,
          visibility: 'hidden',
          willChange: 'transform, opacity',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            transform: 'translate(-50%, -50%)',
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: MD_WHITE,
            border: `2px solid ${MD_PERIWINKLE}`,
            boxShadow: '0 2px 6px rgba(23, 10, 46, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src='/assets/MOBILTYDATA_logo_purple_M.png'
            alt='MobilityData — Montreal'
            style={{ width: 20, height: 19 }}
          />
        </div>
      </div>

      {selected && (
        // Split in two: this outer div carries only the tracked screen
        // position, written every frame as a `transform` (compositor-only,
        // no layout/paint) via popupElRef — see updatePopupPosition. The
        // inner div carries the centering offset and entrance animation,
        // both also `transform`-based; nesting them keeps the two
        // transforms from stepping on each other (the CSS animation's
        // keyframes fully own `transform` on whatever element they're
        // applied to for their duration).
        <div
          key={`${selected.iso2}-${selected.attendee ? selected.attendee.id : 'none'}`}
          ref={popupElRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate3d(${popupPosRef.current.x}px, ${popupPosRef.current.y}px, 0)`,
            // Promotes this to its own compositor layer so the popup's
            // (static) text is rasterized once and then just repositioned
            // every frame, instead of being re-rasterized at each frame's
            // new position — the latter is what reads as the text/content
            // shimmering rather than moving smoothly.
            willChange: 'transform',
            pointerEvents: 'none',
            // Above the Montreal marker (zIndex 2) and the legend/header
            // badges (zIndex 3) — a dialog should never render underneath
            // decorative overlays it happens to pass behind on screen.
            zIndex: 4,
          }}
        >
          <div
            style={{
              position: 'relative',
              transform: 'translate(-50%, calc(-100% - 20px))',
              transformOrigin: 'bottom center',
              animation: 'summitPopIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              background: MD_WHITE,
              border: `2px solid ${MD_PERIWINKLE}`,
              borderRadius: 4,
              padding: '15px 18px',
              fontFamily: MD_FONT_PROSE,
              color: MD_INK,
              width: 325,
            }}
          >
            {selected.attendee?.isMember && (
              <div
                style={{
                  position: 'absolute',
                  top: -13,
                  right: -13,
                  padding: '4px 13px',
                  borderRadius: 999,
                  background: MD_PERIWINKLE,
                  color: MD_WHITE,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  fontFamily: MD_FONT_MONO,
                  boxShadow: '0 3px 8px rgba(23, 10, 46, 0.25)',
                  border: '1px solid white',
                }}
              >
                MobilityData Member
              </div>
            )}
            <div
              style={{
                fontSize: 14,
                letterSpacing: '0.08em',
                fontFamily: MD_FONT_MONO,
                color: MD_PERIWINKLE,
              }}
            >
              {iso2ToFlagEmoji(selected.iso2)} {selected.name}
            </div>

            {selected.attendee ? (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: MD_PERIWINKLE,
                    overflowWrap: 'break-word',
                  }}
                >
                  {selected.attendee.agency}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    color: MD_INK_MUTED,
                    marginTop: 1,
                    fontFamily: MD_FONT_MONO,
                  }}
                >
                  {selected.attendee.municipality}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginTop: 8,
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
                gap: 10,
                marginTop: 15,
                paddingTop: 13,
                borderTop: `1px solid ${MD_PERIWINKLE_SOFT}`,
                fontSize: 15,
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
                    fontSize: 19,
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
                    fontSize: 19,
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
                bottom: -8,
                transform: 'translateX(-50%) rotate(45deg)',
                width: 13,
                height: 13,
                background: MD_WHITE,
                borderRight: `2px solid ${MD_PERIWINKLE}`,
                borderBottom: `2px solid ${MD_PERIWINKLE}`,
              }}
            />
          </div>
        </div>
      )}
      {allowFullscreen && !isFullscreen && (
        <button
          type='button'
          onClick={() => {
            requestFullscreenForElement(containerRef.current);
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
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: MD_WHITE,
            border: `2px solid ${MD_PERIWINKLE}`,
            borderRadius: 4,
            padding: '8px 14px',
            fontFamily: MD_FONT_PROSE,
            color: MD_INK,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src='/assets/MOBILTYDATA_logo_purple_M.png'
            alt='MobilityData logo'
            style={{ width: 50, height: 48, flexShrink: 0 }}
          />
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.08em',
                fontFamily: MD_FONT_MONO,
                color: MD_PERIWINKLE,
              }}
            >
              2026
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1.2,
                color: MD_PERIWINKLE,
                marginTop: 2,
              }}
            >
              MobilityData Summit
            </div>
          </div>
        </div>
        {/* Fullscreen auto-starts the tour (see handleFullscreenChange) as
            an immersive, hands-off presentation — the toggle button (which
            would read "Stop tour" the whole time) is hidden rather than
            shown as a way to interrupt that. */}
        {!isFullscreen && (
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
              e.currentTarget.style.boxShadow =
                '0 1px 3px rgba(23, 10, 46, 0.2)';
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
        )}
      </div>
    </div>
  );
}

// Draws one glowing arc from each attendee city back to Montreal — the
// summit's host city — so the globe reads as "the world converging on
// Montreal" rather than just a set of shaded countries.
function buildAttendeeArcs(globeGroup, radius, cities) {
  const arcRadius = radius * CITY_MARKER_RADIUS_SCALE;
  const montrealDir = lonLatToVec3(MONTREAL_LON, MONTREAL_LAT, 1);
  const arcs = [];
  for (const city of cities) {
    const fromDir = lonLatToVec3(city.lon, city.lat, 1);
    const arc = createAttendeeArc(
      fromDir,
      montrealDir,
      arcRadius,
      MD_PERIWINKLE,
    );
    arc.userData.municipality = city.municipality;
    arc.userData.iso2 = city.iso2;
    globeGroup.add(arc);
    arcs.push(arc);
  }
  return arcs;
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
