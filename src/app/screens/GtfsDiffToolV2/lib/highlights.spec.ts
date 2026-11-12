import {
  type EntityRow,
  type Highlight,
  highlightsFileName,
  inlineHighlights,
  makeHighlight,
} from './highlights';

function rows(n: number): EntityRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    label: '',
    note: '',
  }));
}

describe('inlineHighlights', () => {
  it('keeps the first rows of a long list and records the full count', () => {
    const [h] = inlineHighlights(
      [makeHighlight('renamed', 0.4, 't', 'd', rows(120))],
      50,
    );
    expect(h.entities).toHaveLength(50);
    expect(h.entities?.[49].id).toBe('s49');
    expect(h.entities_total).toBe(120);
  });

  it('leaves short lists and highlights without entities as they are', () => {
    const short = makeHighlight('moved_far', 0.5, 't', 'd', rows(50));
    const none: Highlight<EntityRow[]> = makeHighlight('gap', 0.5, 't', 'd');
    expect(inlineHighlights([short, none], 50)).toEqual([short, none]);
  });

  it('does not change the full list it was given', () => {
    const full = [makeHighlight('renamed', 0.4, 't', 'd', rows(60))];
    inlineHighlights(full, 50);
    expect(full[0].entities).toHaveLength(60);
    expect(full[0].entities_total).toBeUndefined();
  });
});

describe('highlightsFileName', () => {
  it('names the file after the section', () => {
    expect(highlightsFileName('stops')).toBe('stops-highlights.json');
  });
});
