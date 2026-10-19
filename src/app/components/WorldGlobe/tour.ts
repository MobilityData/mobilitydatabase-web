export const TOUR_DWELL_SECONDS = 10;
// How many recent stops the tour avoids revisiting.
export const TOUR_MEMORY = 12;

/**
 * Returns a picker that chooses the next tour stop, weighted by log-scaled
 * feed count so the tour favours well-covered countries without only ever
 * showing the top five. Shared by the globe and the flat map.
 */
export function createTourPicker<T extends { intensity: number }>(
  candidates: T[],
): () => T | null {
  const recent: T[] = [];
  return () => {
    const fresh = candidates.filter((c) => !recent.includes(c));
    const pool = fresh.length ? fresh : candidates;
    if (!pool.length) return null;
    const total = pool.reduce((sum, c) => sum + c.intensity, 0);
    let r = Math.random() * total;
    let stop = pool[pool.length - 1];
    for (const c of pool) {
      r -= c.intensity;
      if (r <= 0) {
        stop = c;
        break;
      }
    }
    recent.push(stop);
    if (recent.length > TOUR_MEMORY) recent.shift();
    return stop;
  };
}
