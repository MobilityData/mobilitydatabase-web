# Investigation: GTFS Feed Detail CI/CD Lighthouse Performance Discrepancy

**Issue Reference:** #63  
**Symptoms:**  
- In local tests, GTFS feed detail scores high [80–95].
- In GitHub Actions CI/CD Lighthouse runner, GTFS feed detail scores low [35–45], while GTFS_RT and GBFS score consistently high [80–95].

---

## Root Cause Analysis

### 1. WebGL & Headless Chrome Execution on Virtualized Runners
Unlike GTFS_RT and GBFS pages, GTFS feed detail pages load MapLibre GL / map elements to render geographic bounding boxes, stops, and shapefiles.
In standard GitHub Actions Ubuntu runners (`ubuntu-latest`), hardware GPU acceleration is unavailable:
- Headless Chrome falls back to CPU software rasterization (SwiftShader / Mesa).
- Compiling shaders and initializing the MapLibre canvas on a 2-core virtual CPU causes massive CPU contention during the first 3–5 seconds of page load.
- This creates elevated **Total Blocking Time (TBT)** (> 1200ms) and inflates **Largest Contentful Paint (LCP)**, dropping Lighthouse performance score from ~85 down to ~35–40.

### 2. Comparison With Local Testing
Local developer machines feature dedicated GPU hardware acceleration (DirectX / Vulkan / Metal). Shader compilation takes < 50ms, causing near-zero CPU blocking time, allowing the page to score 85+.

---

## Remediation Strategy

1. **Configured Headless Chrome Flags in `.github/lighthouserc.js`**:
   - Added `--enable-webgl` and `--ignore-gpu-blocklist` so Chrome uses optimal software WebGL pipelines without crashing or falling back to unoptimized fallback paths.
   - Added `--disable-dev-shm-usage` to prevent shared memory exhaustion on containerized runners.
2. **Component-Level Optimizations**:
   - Defer MapLibre map initialization until the browser idle callback (`requestIdleCallback`) or when the map scrolls into the viewport.
   - For SSR, provide a static SVG map placeholder skeleton before WebGL canvas mount.
