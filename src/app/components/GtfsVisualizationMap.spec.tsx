import {
  generatePmtilesUrls,
  generateStopColorExpression,
  generateRouteOutlineColorExpression,
} from './GtfsVisualizationMap.functions';

const LIGHT_BG = '#f6f6f6';
const DARK_BG = '#0d0d0d';
const LIGHT_ALT = '#444444';
const DARK_ALT = '#ffffff';

describe('generateStopColorExpression', () => {
  it('returns fallback directly when routeIdToColor is empty', () => {
    expect(generateStopColorExpression({}, LIGHT_BG, LIGHT_ALT, '#888')).toBe(
      '#888',
    );
  });

  it('skips entries with null or invalid hex colors and returns fallback', () => {
    const result = generateStopColorExpression(
      { r1: null as unknown as string, r2: 'gggggg', r3: '' },
      LIGHT_BG,
      LIGHT_ALT,
    );
    expect(result).toBe('#888');
  });

  it('expands 3-digit hex to 6-digit before comparison', () => {
    // #000 → #000000 (black) — high contrast against light bg → route color wins
    const result = generateStopColorExpression(
      { r1: '000' },
      LIGHT_BG,
      LIGHT_ALT,
    ) as unknown[];
    expect(result[0]).toBe('case');
    expect(result[2]).toBe('#000000');
  });

  it('uses route color when crBg >= crAlt (black route on light bg)', () => {
    // crBg(black vs #f6f6f6) ≈ 20.3 >> crAlt(black vs #444444) ≈ 13.4 → route color wins
    const result = generateStopColorExpression(
      { route1: '000000' },
      LIGHT_BG,
      LIGHT_ALT,
    ) as unknown[];
    expect(result[0]).toBe('case');
    expect(result[2]).toBe('#000000');
  });

  it('uses alt color when crAlt > crBg (white route on light bg)', () => {
    // crBg(white vs #f6f6f6) ≈ 1.03 << crAlt(white vs #444444) ≈ 3.31 → alt wins
    const result = generateStopColorExpression(
      { route1: 'ffffff' },
      LIGHT_BG,
      LIGHT_ALT,
    ) as unknown[];
    expect(result[0]).toBe('case');
    expect(result[2]).toBe(LIGHT_ALT);
  });

  it('uses alt color for dark route on dark map background', () => {
    // crBg(black vs #0d0d0d) ≈ 2.02 << crAlt(black vs #ffffff) ≈ 21 → alt wins
    const result = generateStopColorExpression(
      { route1: '000000' },
      DARK_BG,
      DARK_ALT,
    ) as unknown[];
    expect(result[2]).toBe(DARK_ALT);
  });

  it('picks correct color independently per route', () => {
    // r1=black → route color, r2=white → alt
    const result = generateStopColorExpression(
      { r1: '000000', r2: 'ffffff' },
      LIGHT_BG,
      LIGHT_ALT,
    ) as unknown[];
    expect(result[0]).toBe('case');
    expect(result[2]).toBe('#000000'); // r1: route color
    expect(result[4]).toBe(LIGHT_ALT); // r2: alt color
    expect(result[5]).toBe('#888'); // fallback
  });

  it('includes the fallback as the last element of the case expression', () => {
    const result = generateStopColorExpression(
      { r1: '000000' },
      LIGHT_BG,
      LIGHT_ALT,
      '#cccccc',
    ) as unknown[];
    expect(result[result.length - 1]).toBe('#cccccc');
  });
});

describe('generateRouteOutlineColorExpression', () => {
  // Helper to safely index into nested unknown arrays
  type NestedArr = Array<unknown | NestedArr>;
  const at = (arr: NestedArr, ...indices: number[]): NestedArr =>
    indices.reduce<NestedArr>((a, i) => (a as NestedArr[])[i], arr);
  it('returns an array expression starting with "let" and "rgba"', () => {
    const result = generateRouteOutlineColorExpression(LIGHT_BG, LIGHT_ALT);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBe('let');
    expect(result[1]).toBe('rgba');
  });

  it('embeds mapBgColor and altOutlineColor as the case outputs', () => {
    const result = generateRouteOutlineColorExpression(LIGHT_BG, LIGHT_ALT);
    // Navigate to the innermost case: result[3][3][3][3]
    const caseExpr = at(result as NestedArr, 3, 3, 3, 3);
    expect(caseExpr[0]).toBe('case');
    expect(caseExpr[2]).toBe(LIGHT_BG); // chosen when crBg >= crAlt
    expect(caseExpr[3]).toBe(LIGHT_ALT); // chosen when crAlt > crBg
  });

  it('embeds precomputed bgLum for the given mapBgColor in the crBg expression', () => {
    const result = generateRouteOutlineColorExpression('#f6f6f6', LIGHT_ALT);
    // bgLum for #f6f6f6: (246/255) ≈ 0.9647  (Rec. 709 coefficients sum to 1 for grey)
    const expectedBgLum = (0.2126 * 246 + 0.7152 * 246 + 0.0722 * 246) / 255;
    // structure: result[3]=['let','lum',...,innerCrBg], result[3][3]=['let','crBg',crBgExpr,...]
    // crBgExpr = ['/', ['+', ['max', ['var','lum'], bgLum], 0.05], ...]
    // bgLum appears at crBgExpr[1][1][2]
    const crBgExpr = at(result as NestedArr, 3, 3, 2);
    const bgLumInExpr = at(crBgExpr, 1, 1)[2] as number;
    expect(bgLumInExpr).toBeCloseTo(expectedBgLum, 10);
  });

  it('works for dark mode colors without error', () => {
    expect(() =>
      generateRouteOutlineColorExpression(DARK_BG, DARK_ALT),
    ).not.toThrow();
  });

  it('uses different precomputed luminance values for light vs dark bg', () => {
    const lightResult = generateRouteOutlineColorExpression(
      LIGHT_BG,
      LIGHT_ALT,
    );
    const darkResult = generateRouteOutlineColorExpression(DARK_BG, DARK_ALT);
    const crBgLight = at(lightResult as NestedArr, 3, 3, 2);
    const crBgDark = at(darkResult as NestedArr, 3, 3, 2);
    const bgLumLight = at(crBgLight, 1, 1)[2] as number;
    const bgLumDark = at(crBgDark, 1, 1)[2] as number;
    expect(bgLumLight).toBeGreaterThan(bgLumDark);
  });
});

describe('generatePmtilesUrls', () => {
  const latestDataset = {
    hosted_url:
      'https://files.mobilitydatabase.org/mdb-437/mdb-437-202511031503/mdb-437-202511031503.zip',
  };

  const latestDatasetJbda = {
    hosted_url:
      'https://files.mobilitydatabase.org/jbda-4371/jbda-4371-202511050124/jbda-4371-202511031503.zip',
  };

  it('should generate correct PMTiles URLs when given valid dataset and visualizationId', () => {
    const result = generatePmtilesUrls(latestDataset, 'mdb-120-202511060901');

    expect(result).toEqual({
      stopsPmtilesUrl:
        'https://files.mobilitydatabase.org/mdb-437/mdb-120-202511060901/pmtiles/stops.pmtiles',
      routesPmtilesUrl:
        'https://files.mobilitydatabase.org/mdb-437/mdb-120-202511060901/pmtiles/routes.pmtiles',
    });
  });

  it('should return URLs with different system ids', () => {
    const result = generatePmtilesUrls(
      latestDatasetJbda,
      'jbda-120-202511060901',
    );
    expect(result.stopsPmtilesUrl).toContain(
      'https://files.mobilitydatabase.org/jbda-4371/jbda-120-202511060901/pmtiles/stops.pmtiles',
    );
  });

  it('should handle undefined dataset gracefully', () => {
    const result = generatePmtilesUrls(undefined, 'jbda-120-202511060901');

    expect(result).toEqual({
      stopsPmtilesUrl: 'pmtiles/stops.pmtiles',
      routesPmtilesUrl: 'pmtiles/routes.pmtiles',
    });
  });

  it('should handle empty visualizationId', () => {
    const result = generatePmtilesUrls(latestDataset, '');

    expect(result.stopsPmtilesUrl).toContain('pmtiles/stops.pmtiles');
    expect(result.routesPmtilesUrl).toContain('pmtiles/routes.pmtiles');
  });
});
