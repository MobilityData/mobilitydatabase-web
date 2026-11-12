import type { DaySummary } from './trips-v2-summary';
import { routeChangeChips } from './trips-v5-route-summary';

function summary(over: Partial<DaySummary> = {}): DaySummary {
  return {
    routes: { total: 1, changed: 1 },
    added: 0,
    removed: 0,
    retimedRoutes: 0,
    patternChanges: 0,
    idOnly: 0,
    quietRouteDirs: 0,
    ...over,
  };
}

describe('routeChangeChips', () => {
  it('leaves out the routes-changed count', () => {
    expect(routeChangeChips(summary(), []).counts).toEqual([]);
  });

  it('keeps a count over the category it covers', () => {
    const out = routeChangeChips(summary({ added: 2, patternChanges: 5 }), [
      'new_stop',
      'stop_removed',
      'trips_added',
    ]);
    expect(out.counts.map((c) => c.label)).toEqual([
      '2 trips added',
      '5 stop pattern changes',
    ]);
    // Stop pattern categories say which change: kept beside the count.
    expect(out.categories).toEqual(['new_stop', 'stop_removed']);
    expect(
      routeChangeChips(summary({ patternChanges: 3 }), ['rerouted', 'new_stop'])
        .categories,
    ).toEqual(['new_stop']);
  });

  it('drops retiming and trip_id categories under their counts', () => {
    const out = routeChangeChips(summary({ retimedRoutes: 1, idOnly: 3 }), [
      'shifted',
      'running_time',
      'id_only',
      'rules',
    ]);
    expect(out.categories).toEqual(['rules']);
  });

  it('keeps categories no count covers', () => {
    expect(
      routeChangeChips(summary(), ['trips_added', 'running_time']).categories,
    ).toEqual(['trips_added', 'running_time']);
  });
});
