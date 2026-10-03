/** Contiguous ranges keep every turn reachable when the rail runs out of height. */
export function turnBuckets(turnCount: number, availableHeight: number, targetHeight = 24): { start: number; end: number }[] {
  if (turnCount <= 0) return [];
  const count = Math.min(turnCount, Math.max(1, Math.floor(availableHeight / targetHeight)));
  return Array.from({ length: count }, (_, index) => ({
    start: Math.floor(index * turnCount / count),
    end: Math.floor((index + 1) * turnCount / count) - 1,
  }));
}

export interface TurnPosition { top: number; bottom: number }

/** Prefer the first visible prompt, retaining its turn while the answer fills the viewport. */
export function activeTurnIndex(positions: readonly TurnPosition[], viewportTop: number, viewportBottom: number): number {
  if (viewportBottom <= viewportTop) return -1;
  const visible = positions.findIndex(position => position.bottom > viewportTop && position.top < viewportBottom);
  if (visible >= 0) return visible;
  for (let index = positions.length - 1; index >= 0; index--)
    if (positions[index].top <= viewportTop) return index;
  return positions.length ? 0 : -1;
}

export function turnFocusIndex(key: string, index: number, count: number): number | null {
  if (!count) return null;
  switch (key) {
    case 'ArrowDown': return Math.min(index + 1, count - 1);
    case 'ArrowUp': return Math.max(index - 1, 0);
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}
