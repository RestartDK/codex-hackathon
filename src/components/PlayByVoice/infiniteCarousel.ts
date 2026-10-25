export const LOOP_CENTER = 3;
export const LOOP_COPIES = 7;

export function normalizeLoopPosition(position: number, cycleWidth: number) {
  if (cycleWidth <= 0) return position;
  if (position < cycleWidth * 2) return position + cycleWidth;
  if (position > cycleWidth * 4) return position - cycleWidth;
  return position;
}
