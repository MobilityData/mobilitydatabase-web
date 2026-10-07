export type PopupPlacement = 'above' | 'below';

export interface PopupFit {
  placement: PopupPlacement;
  /** Horizontal card offset in px; the arrow stays on the anchor. */
  shift: number;
}

/** Keeps the arrow this far from the card's rounded corners. */
const ARROW_INSET = 16;

/**
 * Where a popup card pinned to (x, y) should sit so it stays inside a
 * width x height container: above the anchor if it fits, otherwise below,
 * otherwise whichever side has more room; slid sideways near the edges.
 */
export function fitPopup({
  x,
  y,
  width,
  height,
  cardWidth,
  cardHeight,
  offset,
  margin = 8,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  cardWidth: number;
  cardHeight: number;
  /** Anchor-to-card gap, arrow included. */
  offset: number;
  margin?: number;
}): PopupFit {
  const needed = cardHeight + offset + margin;
  const spaceAbove = y;
  const spaceBelow = height - y;
  const placement: PopupPlacement =
    spaceAbove >= needed || (spaceBelow < needed && spaceAbove >= spaceBelow)
      ? 'above'
      : 'below';

  const half = cardWidth / 2;
  const maxArrowShift = Math.max(half - ARROW_INSET, 0);
  let shift = 0;
  if (x - half < margin) shift = margin - (x - half);
  else if (x + half > width - margin) shift = width - margin - (x + half);
  shift = Math.min(maxArrowShift, Math.max(-maxArrowShift, shift));
  return { placement, shift };
}
