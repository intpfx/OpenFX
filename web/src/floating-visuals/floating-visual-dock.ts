export type FloatingDockPoint = Readonly<{
  x: number;
  y: number;
}>;

export type FloatingDockSize = Readonly<{
  width: number;
  height: number;
}>;

export type FloatingDockViewport =
  & FloatingDockSize
  & Readonly<{
    offsetLeft?: number;
    offsetTop?: number;
  }>;

export type TimedVisualState<Id extends string = string> = Readonly<{
  id: Id;
  durationMs: number;
}>;

const DOCK_VIEWPORT_MARGIN = 12;

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function constrainFloatingDockPosition(
  position: FloatingDockPoint,
  dock: FloatingDockSize,
  viewport: FloatingDockViewport,
  margin = DOCK_VIEWPORT_MARGIN,
): FloatingDockPoint {
  const safeMargin = Math.max(0, finiteOrZero(margin));
  const minimumX = finiteOrZero(viewport.offsetLeft ?? 0) + safeMargin;
  const minimumY = finiteOrZero(viewport.offsetTop ?? 0) + safeMargin;
  const maximumX = Math.max(
    minimumX,
    finiteOrZero(viewport.offsetLeft ?? 0) + finiteOrZero(viewport.width) -
      finiteOrZero(dock.width) - safeMargin,
  );
  const maximumY = Math.max(
    minimumY,
    finiteOrZero(viewport.offsetTop ?? 0) + finiteOrZero(viewport.height) -
      finiteOrZero(dock.height) - safeMargin,
  );

  return {
    x: clamp(finiteOrZero(position.x), minimumX, maximumX),
    y: clamp(finiteOrZero(position.y), minimumY, maximumY),
  };
}

export function moveFloatingDockFromPointer(
  originPosition: FloatingDockPoint,
  originPointer: FloatingDockPoint,
  pointer: FloatingDockPoint,
  dock: FloatingDockSize,
  viewport: FloatingDockViewport,
): FloatingDockPoint {
  return constrainFloatingDockPosition(
    {
      x: originPosition.x + pointer.x - originPointer.x,
      y: originPosition.y + pointer.y - originPointer.y,
    },
    dock,
    viewport,
  );
}

export function resolveTimedVisualState<Id extends string>(
  states: readonly TimedVisualState<Id>[],
  timeMs: number,
): Readonly<{
  id: Id;
  index: number;
  elapsedMs: number;
  cycleDurationMs: number;
}> {
  const cycleDurationMs = states.reduce(
    (total, state) => total + Math.max(0, finiteOrZero(state.durationMs)),
    0,
  );
  if (states.length === 0 || cycleDurationMs <= 0) {
    throw new RangeError("A timed visual sequence needs at least one duration.");
  }

  const wrapped = ((finiteOrZero(timeMs) % cycleDurationMs) + cycleDurationMs) %
    cycleDurationMs;
  let offset = 0;
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index];
    const durationMs = Math.max(0, finiteOrZero(state.durationMs));
    if (wrapped < offset + durationMs) {
      return {
        id: state.id,
        index,
        elapsedMs: wrapped - offset,
        cycleDurationMs,
      };
    }
    offset += durationMs;
  }

  const lastIndex = states.length - 1;
  return {
    id: states[lastIndex].id,
    index: lastIndex,
    elapsedMs: 0,
    cycleDurationMs,
  };
}
