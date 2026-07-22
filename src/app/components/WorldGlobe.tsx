// @ts-nocheck
'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import earcut from "earcut";

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
  US: 2163, FR: 1138, JP: 658, DE: 425, CA: 397, ES: 234, IT: 204, PL: 161,
  GB: 115, FI: 90, CH: 87, NO: 86, CZ: 85, NL: 78, BE: 72, AU: 62, AT: 52,
  PT: 46, RO: 44, DK: 40, HU: 39, HR: 36, NZ: 30, IE: 29, SE: 26, SI: 24,
  LU: 23, SK: 20, BR: 19, LT: 17, UA: 17, MC: 14, BG: 12, RS: 12, MX: 10,
  MY: 10, GR: 10, IN: 9, TR: 9, AE: 9, CY: 8, LI: 8, DZ: 8, ML: 7, CL: 7,
  SA: 7, TN: 7, AR: 7, ET: 6, MA: 6, LV: 6, IL: 5, RU: 5, SO: 4, SG: 4,
  TG: 4, TW: 4, BA: 4, EE: 4, MD: 4, NE: 4, NI: 3, CO: 3, MK: 3, CM: 3,
  PE: 3, EG: 3, BF: 3, GH: 3, ID: 3, KE: 2, IS: 2, GL: 2, CD: 2, ME: 2,
  BY: 2, RW: 2, CN: 2, PH: 2, AD: 2, ZW: 1, AL: 1, AM: 1, BJ: 1, BM: 1,
  BO: 1, CI: 1, CR: 1, CV: 1, DO: 1, GE: 1, GG: 1, JO: 1, KH: 1, LA: 1,
  MM: 1, SL: 1, SN: 1, TH: 1, UG: 1, ZA: 1,
};

// world-atlas 110m uses numeric ISO country codes (ISO 3166-1 numeric).
const NUM_TO_ISO2 = {
  "004": "AF", "008": "AL", "010": "AQ", "012": "DZ", "016": "AS", "020": "AD",
  "024": "AO", "028": "AG", "031": "AZ", "032": "AR", "036": "AU", "040": "AT",
  "044": "BS", "048": "BH", "050": "BD", "051": "AM", "052": "BB", "056": "BE",
  "060": "BM", "064": "BT", "068": "BO", "070": "BA", "072": "BW", "076": "BR",
  "084": "BZ", "090": "SB", "092": "VG", "096": "BN", "100": "BG", "104": "MM",
  "108": "BI", "112": "BY", "116": "KH", "120": "CM", "124": "CA", "132": "CV",
  "136": "KY", "140": "CF", "144": "LK", "148": "TD", "152": "CL", "156": "CN",
  "158": "TW", "162": "CX", "166": "CC", "170": "CO", "174": "KM", "175": "YT",
  "178": "CG", "180": "CD", "184": "CK", "188": "CR", "191": "HR", "192": "CU",
  "196": "CY", "203": "CZ", "204": "BJ", "208": "DK", "212": "DM", "214": "DO",
  "218": "EC", "222": "SV", "226": "GQ", "231": "ET", "232": "ER", "233": "EE",
  "234": "FO", "238": "FK", "239": "GS", "242": "FJ", "246": "FI", "248": "AX",
  "250": "FR", "254": "GF", "258": "PF", "260": "TF", "262": "DJ", "266": "GA",
  "268": "GE", "270": "GM", "275": "PS", "276": "DE", "288": "GH", "292": "GI",
  "296": "KI", "300": "GR", "304": "GL", "308": "GD", "312": "GP", "316": "GU",
  "320": "GT", "324": "GN", "328": "GY", "332": "HT", "334": "HM", "336": "VA",
  "340": "HN", "344": "HK", "348": "HU", "352": "IS", "356": "IN", "360": "ID",
  "364": "IR", "368": "IQ", "372": "IE", "376": "IL", "380": "IT", "384": "CI",
  "388": "JM", "392": "JP", "398": "KZ", "400": "JO", "404": "KE", "408": "KP",
  "410": "KR", "414": "KW", "417": "KG", "418": "LA", "422": "LB", "426": "LS",
  "428": "LV", "430": "LR", "434": "LY", "438": "LI", "440": "LT", "442": "LU",
  "446": "MO", "450": "MG", "454": "MW", "458": "MY", "462": "MV", "466": "ML",
  "470": "MT", "474": "MQ", "478": "MR", "480": "MU", "484": "MX", "492": "MC",
  "496": "MN", "498": "MD", "499": "ME", "500": "MS", "504": "MA", "508": "MZ",
  "512": "OM", "516": "NA", "520": "NR", "524": "NP", "528": "NL", "531": "CW",
  "533": "AW", "534": "SX", "535": "BQ", "540": "NC", "548": "VU", "554": "NZ",
  "558": "NI", "562": "NE", "566": "NG", "570": "NU", "574": "NF", "578": "NO",
  "580": "MP", "581": "UM", "583": "FM", "584": "MH", "585": "PW", "586": "PK",
  "591": "PA", "598": "PG", "600": "PY", "604": "PE", "608": "PH", "612": "PN",
  "616": "PL", "620": "PT", "624": "GW", "626": "TL", "630": "PR", "634": "QA",
  "638": "RE", "642": "RO", "643": "RU", "646": "RW", "652": "BL", "654": "SH",
  "659": "KN", "660": "AI", "662": "LC", "663": "MF", "666": "PM", "670": "VC",
  "674": "SM", "678": "ST", "682": "SA", "686": "SN", "688": "RS", "690": "SC",
  "694": "SL", "702": "SG", "703": "SK", "704": "VN", "705": "SI", "706": "SO",
  "710": "ZA", "716": "ZW", "724": "ES", "728": "SS", "729": "SD", "732": "EH",
  "740": "SR", "744": "SJ", "748": "SZ", "752": "SE", "756": "CH", "760": "SY",
  "762": "TJ", "764": "TH", "768": "TG", "772": "TK", "776": "TO", "780": "TT",
  "784": "AE", "788": "TN", "792": "TR", "795": "TM", "796": "TC", "798": "TV",
  "800": "UG", "804": "UA", "807": "MK", "818": "EG", "826": "GB", "831": "GG",
  "832": "JE", "833": "IM", "834": "TZ", "840": "US", "850": "VI", "854": "BF",
  "858": "UY", "860": "UZ", "862": "VE", "876": "WF", "882": "WS", "887": "YE",
  "894": "ZM",
};

const ISO2_TO_NAME_FALLBACK = {
  US: "United States", FR: "France", JP: "Japan", DE: "Germany",
  CA: "Canada", ES: "Spain", IT: "Italy", PL: "Poland", GB: "United Kingdom",
};

// Logarithmic blue scale using theme primary — data ranges 1..2163.
function feedsToColor(feeds) {
  if (!feeds || feeds <= 0) return new THREE.Color("#e8ecf0");
  const maxFeeds = 2163;
  const t = Math.log(feeds + 1) / Math.log(maxFeeds + 1);
  const light = new THREE.Color("#c8d4ff"); // tinted from primary light
  const dark = new THREE.Color("#002eea");  // theme primary.dark
  return light.clone().lerp(dark, t);
}

function lonLatToVec3(lon, lat, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
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
  p = clipPolygon(p,
    (pt) => pt[0] >= xMin,
    (a, b) => {
      const t = (xMin - a[0]) / (b[0] - a[0]);
      return [xMin, a[1] + t * (b[1] - a[1])];
    });
  if (!p.length) return [];
  p = clipPolygon(p,
    (pt) => pt[0] <= xMax,
    (a, b) => {
      const t = (xMax - a[0]) / (b[0] - a[0]);
      return [xMax, a[1] + t * (b[1] - a[1])];
    });
  if (!p.length) return [];
  p = clipPolygon(p,
    (pt) => pt[1] >= yMin,
    (a, b) => {
      const t = (yMin - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), yMin];
    });
  if (!p.length) return [];
  p = clipPolygon(p,
    (pt) => pt[1] <= yMax,
    (a, b) => {
      const t = (yMax - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), yMax];
    });
  return p;
}

function bboxOfRing(ring) {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const [x, y] of ring) {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  return [xMin, yMin, xMax, yMax];
}

// Build sphere-wrapped geometry for a polygon by subdividing it on a lat/lon grid.
// Each grid cell is small enough that flat triangulation wraps the sphere cleanly.
// `gridSize` in degrees (smaller = smoother = more triangles).
function polygonToSphereGeometry(rings, radius, gridSize = 2) {
  const outer = rings[0];
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
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function polygonCentroid(rings) {
  let sx = 0, sy = 0, n = 0;
  for (const ring of rings) {
    for (const [lon, lat] of ring) { sx += lon; sy += lat; n++; }
  }
  return [sx / n, sy / n];
}

// ---------- TopoJSON -> GeoJSON (minimal inline decoder) ----------
function feature(topology, object) {
  const { arcs, transform } = topology;
  const { scale = [1, 1], translate = [0, 0] } = transform || {};
  function decodeArc(i) {
    const reverse = i < 0;
    if (reverse) i = ~i;
    const arc = arcs[i];
    let x = 0, y = 0;
    const out = arc.map(([dx, dy]) => {
      x += dx; y += dy;
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
    type: "FeatureCollection",
    features: object.geometries.map((g) => {
      let coordinates;
      if (g.type === "Polygon") coordinates = g.arcs.map(ringFromArcs);
      else if (g.type === "MultiPolygon") coordinates = g.arcs.map((poly) => poly.map(ringFromArcs));
      return {
        type: "Feature",
        properties: g.properties || {},
        id: g.id,
        geometry: { type: g.type, coordinates },
      };
    }),
  };
}

// ---------- Component ----------
export default function WorldGlobe({
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

  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Directional lighting for dimensional depth.
    // Ambient fill keeps the dark side visible.
    const ambient = new THREE.AmbientLight(0xdde4f0, 0.65);
    scene.add(ambient);
    // Key light: warm white from upper-left, moderate intensity.
    const keyLight = new THREE.DirectionalLight(0xfff8f0, 0.7);
    keyLight.position.set(-4, 3, 5);
    scene.add(keyLight);
    // Fill light: cooler, softer, from the opposite side.
    const fillLight = new THREE.DirectionalLight(0xd0d8f0, 0.25);
    fillLight.position.set(4, -1, -3);
    scene.add(fillLight);
    // Subtle rim/back light to separate globe from background.
    const rimLight = new THREE.DirectionalLight(0xe8eeff, 0.15);
    rimLight.position.set(0, 0, -5);
    scene.add(rimLight);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    const OCEAN_RADIUS = 0.998;
    const COUNTRY_RADIUS = 1.0;

    const oceanGeom = new THREE.SphereGeometry(OCEAN_RADIUS, 64, 64);
    const oceanMat = new THREE.MeshPhongMaterial({
      color: 0xf5f7ff,
      shininess: 4,
      specular: 0x111122,
      transparent: true,
      opacity: 0,
    });
    globeGroup.add(new THREE.Mesh(oceanGeom, oceanMat));

    // Atmospheric glow / halo — subtle cyan-blue fresnel on a larger sphere.
    // BackSide rendering so only the outer silhouette ring is visible.
    const atmosGeom = new THREE.SphereGeometry(1.06, 64, 64);
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
          float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
          // Soft falloff: visible at edges, invisible at centre.
          float alpha = pow(rim, 3.0) * 0.45;
          // Light cyan-blue glow colour (~#BFDBFE).
          vec3 glowColor = vec3(0.75, 0.86, 1.0);
          gl_FragColor = vec4(glowColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    scene.add(new THREE.Mesh(atmosGeom, atmosMat));

    // Inner fresnel — subtle edge darkening on the globe itself for depth.
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
          float alpha = pow(rim, 4.0) * 0.3;
          // Slight blue-tinted shadow at the rim.
          vec3 edgeColor = vec3(0.55, 0.62, 0.82);
          gl_FragColor = vec4(edgeColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    globeGroup.add(new THREE.Mesh(innerAtmosGeom, innerAtmosMat));

    const COUNTRIES_URL =
      "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

    fetch(COUNTRIES_URL)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load country data");
        return r.json();
      })
      .then((topo) => {
        const geo = feature(topo, topo.objects.countries);
        buildCountries(geo, globeGroup, COUNTRY_RADIUS, countryMeshesRef);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setError(e.message || "Failed to load");
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
    const DRAG_THRESHOLD = 4; // px – distinguishes click from drag

    function onPointerDown(event) {
      isDragging = true;
      dragMoved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      rotatingRef.current = false;
      renderer.domElement.style.cursor = "grabbing";
    }

    function onPointerMove(event) {
      if (!isDragging) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragMoved = true;
      const rect = renderer.domElement.getBoundingClientRect();
      const scaleFactor = Math.PI / rect.width; // ~180° per full width
      globeGroup.rotation.y += (event.clientX - dragStartX) * scaleFactor;
      globeGroup.rotation.x += (event.clientY - dragStartY) * scaleFactor;
      // Clamp vertical rotation to avoid flipping
      globeGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeGroup.rotation.x));
      dragStartX = event.clientX;
      dragStartY = event.clientY;
    }

    function onPointerUp(event) {
      if (!isDragging) return;
      isDragging = false;
      renderer.domElement.style.cursor = "grab";
      if (!dragMoved) {
        // It was a click, not a drag — do hit-test
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(countryMeshesRef.current, false);
        // Filter out hits on the back side of the globe
        const frontHit = hits.find((hit) => {
          const hitPoint = hit.point.clone();
          // Transform to world-space globe center
          const globeCenter = new THREE.Vector3(0, 0, 0).applyMatrix4(globeGroup.matrixWorld);
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

    function selectCountry(mesh) {
      if (selectedRef.current && selectedRef.current !== mesh) {
        const prev = selectedRef.current;
        prev.material.color.copy(prev.userData.baseColor);
        prev.material.emissive.setHex(0x000000);
      }
      selectedRef.current = mesh;
      rotatingRef.current = false;

      mesh.material.color.set("#3959fa"); // theme primary.main
      mesh.material.emissive.setHex(0x0a1a6e);

      updatePopupPosition(mesh);
    }

    function updatePopupPosition(mesh) {
      const centroid3D = mesh.userData.centroid3D.clone();
      centroid3D.applyMatrix4(globeGroup.matrixWorld);
      const projected = centroid3D.clone().project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      const sx = (projected.x * 0.5 + 0.5) * rect.width;
      const sy = (-projected.y * 0.5 + 0.5) * rect.height;
      setSelected({
        name: mesh.userData.name,
        iso2: mesh.userData.iso2,
        feeds: mesh.userData.feeds,
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

    // ---- Zoom via scroll wheel ----
    const MIN_ZOOM = 2.0;
    const MAX_ZOOM = 6.0;
    function onWheel(event) {
      event.preventDefault();
      camera.position.z += event.deltaY * 0.002;
      camera.position.z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.position.z));
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

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
      if (rotatingRef.current) globeGroup.rotation.y += dt * 0.06;
      if (selectedRef.current) updatePopupPosition(selectedRef.current);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 500,
        background: "transparent",
      }}
    >
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "#6b7280",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontSize: 14, letterSpacing: "0.05em",
        }}>Loading globe…</div>
      )}
      {error && (
        <div style={{ position: "absolute", top: 12, left: 12, color: "#b91c1c" }}>
          {error}
        </div>
      )}
      {selected && (
        <div
          style={{
            position: "absolute",
            left: selected.screenX,
            top: selected.screenY,
            transform: "translate(-50%, calc(-100% - 14px))",
            pointerEvents: "none",
            background: "white",
            border: "1px solid rgba(57, 89, 250, 0.25)",
            borderRadius: 10,
            padding: "10px 14px",
            boxShadow: "0 8px 24px rgba(0, 46, 234, 0.16)",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
            color: "#0a1a6e",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{
            fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#3959fa", fontWeight: 600,
          }}>{selected.iso2}</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
            {selected.name}
          </div>
          <div style={{ fontSize: 13, marginTop: 4, color: "#002eea" }}>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {selected.feeds.toLocaleString()}
            </span>{" "}
            {selected.feeds === 1 ? "feed" : "feeds"}
          </div>
          <div style={{
            position: "absolute", left: "50%", bottom: -6,
            transform: "translateX(-50%) rotate(45deg)",
            width: 10, height: 10, background: "white",
            borderRight: "1px solid rgba(57, 89, 250, 0.25)",
            borderBottom: "1px solid rgba(57, 89, 250, 0.25)",
          }} />
        </div>
      )}
      {allowFullscreen && !isFullscreen && (
        <button
          type="button"
          onClick={() => {
            if (!rendererRef.current) return;
            requestFullscreenForElement(rendererRef.current.domElement);
          }}
          style={{
            position: "absolute",
            right: 12,
            top: 12,
            zIndex: 3,
            background: "rgba(255,255,255,0.92)",
            color: "#0a1a6e",
            border: "1px solid rgba(57, 89, 250, 0.35)",
            borderRadius: 999,
            padding: "8px 12px",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.02em",
            cursor: "pointer",
          }}
          aria-label="Enter fullscreen globe"
        >
          Fullscreen
        </button>
      )}
    </div>
  );
}

function buildCountries(geo, globeGroup, radius, meshesRef) {
  const meshes = [];
  for (const feat of geo.features) {
    const numId = String(feat.id).padStart(3, "0");
    const iso2 = NUM_TO_ISO2[numId];
    const name = (feat.properties && feat.properties.name) ||
                 ISO2_TO_NAME_FALLBACK[iso2] || iso2 || "Unknown";
    const feeds = iso2 && FEED_DATA[iso2] ? FEED_DATA[iso2] : 0;
    const baseColor = feedsToColor(feeds);

    const polys = feat.geometry.type === "Polygon"
      ? [feat.geometry.coordinates]
      : feat.geometry.coordinates;

    const outerRings = polys.map((rings) => rings[0]).filter(Boolean);
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
      emissive: 0x000000,
      shininess: 6,
      specular: 0x111122,
      side: THREE.DoubleSide,
      transparent: feeds === 0,
      opacity: feeds === 0 ? 0.3 : 1,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.userData = {
      iso2: iso2 || "??",
      name,
      feeds,
      baseColor: baseColor.clone(),
      centroid3D,
    };
    globeGroup.add(mesh);
    if (feeds > 0) meshes.push(mesh);

    // Border outlines (thin white lines between countries).
    for (const rings of polys) {
      const outer = rings[0];
      if (!outer || outer.length < 2) continue;
      const pts = outer.map(([lon, lat]) => lonLatToVec3(lon, lat, radius * 1.001));
      const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
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
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}