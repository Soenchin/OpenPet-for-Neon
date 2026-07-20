import type { PetAnimationId, PetSurfaceInsets, PetWindowSize } from './animation';

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PetDirection = -1 | 1;
export type PetMotionMode = 'dwelling' | 'moving' | 'edge-stopped';
export type PetEdge = 'left' | 'right' | 'top' | 'bottom';

export type PetMotionState = {
  x: number;
  y: number;
  direction: PetDirection;
  animation: PetAnimationId;
  mode: PetMotionMode;
  target: { x: number; y: number } | null;
  waitUntilMs: number;
  edge: PetEdge | null;
  edgeStopId: number;
};

const EDGE_MARGIN = 8;
const TARGET_EDGE_THRESHOLD = 3;
const EDGE_TARGET_CHANCE = 0.28;
const NO_SURFACE_INSETS: PetSurfaceInsets = { left: 0, right: 0 };

export const ROAM_DWELL_MIN_MS = 6_000;
export const ROAM_DWELL_MAX_MS = 18_000;
export const ROAM_EDGE_DWELL_MIN_MS = 10_000;
export const ROAM_EDGE_DWELL_MAX_MS = 22_000;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number, random: () => number): number {
  return min + (max - min) * clamp(random(), 0, 1);
}

function randomWait(nowMs: number, minMs: number, maxMs: number, random: () => number): number {
  return nowMs + Math.round(randomBetween(minMs, maxMs, random));
}

function groundY(workArea: Rect, surfaceSize: PetWindowSize): number {
  return workArea.y + workArea.height - surfaceSize.height - EDGE_MARGIN;
}

function toAnimation(direction: PetDirection): PetAnimationId {
  return direction > 0 ? 'running-right' : 'running-left';
}

function horizontalBounds(
  workArea: Rect,
  surfaceSize: PetWindowSize,
  surfaceInsets: PetSurfaceInsets = NO_SURFACE_INSETS,
) {
  return {
    left: workArea.x + EDGE_MARGIN - surfaceInsets.left,
    right: workArea.x + workArea.width - surfaceSize.width - EDGE_MARGIN + surfaceInsets.right,
  };
}

function verticalBounds(workArea: Rect, surfaceSize: PetWindowSize) {
  return {
    top: workArea.y + EDGE_MARGIN,
    bottom: workArea.y + workArea.height - surfaceSize.height - EDGE_MARGIN,
  };
}

function edgeForPoint(
  point: { x: number; y: number },
  workArea: Rect,
  surfaceSize: PetWindowSize,
  surfaceInsets?: PetSurfaceInsets,
): PetEdge | null {
  const { left, right } = horizontalBounds(workArea, surfaceSize, surfaceInsets);
  const { top, bottom } = verticalBounds(workArea, surfaceSize);
  if (point.x <= left + TARGET_EDGE_THRESHOLD) return 'left';
  if (point.x >= right - TARGET_EDGE_THRESHOLD) return 'right';
  if (point.y <= top + TARGET_EDGE_THRESHOLD) return 'top';
  if (point.y >= bottom - TARGET_EDGE_THRESHOLD) return 'bottom';
  return null;
}

function chooseRoamTarget(
  workArea: Rect,
  surfaceSize: PetWindowSize,
  surfaceInsets: PetSurfaceInsets | undefined,
  random: () => number,
): { x: number; y: number } {
  const { left, right } = horizontalBounds(workArea, surfaceSize, surfaceInsets);
  const { top, bottom } = verticalBounds(workArea, surfaceSize);
  const x = randomBetween(left, right, random);
  const y = randomBetween(top, bottom, random);

  // Occasionally visit an edge. Reaching it stops the pet instead of bouncing
  // straight back, and allows the UI to ask for a manual monitor transfer.
  if (random() >= EDGE_TARGET_CHANCE) return { x, y };

  switch (Math.floor(clamp(random(), 0, 0.9999) * 4)) {
    case 0:
      return { x: left, y };
    case 1:
      return { x: right, y };
    case 2:
      return { x, y: top };
    default:
      return { x, y: bottom };
  }
}

export function fallbackWorkArea(): Rect {
  const screenWithOrigin = window.screen as Screen & {
    availLeft?: number;
    availTop?: number;
  };
  return {
    x: screenWithOrigin.availLeft || 0,
    y: screenWithOrigin.availTop || 0,
    width: window.screen.availWidth || window.innerWidth || 1024,
    height: window.screen.availHeight || window.innerHeight || 768,
  };
}

export function createRestingPetMotion(
  workArea: Rect,
  surfaceSize: PetWindowSize,
  surfaceInsets?: PetSurfaceInsets,
): PetMotionState {
  const { left, right } = horizontalBounds(workArea, surfaceSize, surfaceInsets);
  return {
    x: clamp(right, left, right),
    y: groundY(workArea, surfaceSize),
    direction: -1,
    animation: 'idle',
    mode: 'dwelling',
    target: null,
    waitUntilMs: Number.POSITIVE_INFINITY,
    edge: null,
    edgeStopId: 0,
  };
}

export function createInitialPetMotion(
  workArea: Rect,
  surfaceSize: PetWindowSize,
  directionOrInsets: PetDirection | PetSurfaceInsets = 1,
  surfaceInsets?: PetSurfaceInsets,
): PetMotionState {
  const direction = typeof directionOrInsets === 'number' ? directionOrInsets : 1;
  const resolvedInsets = typeof directionOrInsets === 'number' ? surfaceInsets : directionOrInsets;
  const { left, right } = horizontalBounds(workArea, surfaceSize, resolvedInsets);
  return {
    x: clamp(left, left, right),
    y: groundY(workArea, surfaceSize),
    direction,
    animation: 'idle',
    mode: 'dwelling',
    target: null,
    waitUntilMs: 0,
    edge: null,
    edgeStopId: 0,
  };
}

export function clampPetMotionToWorkArea(
  state: PetMotionState,
  workArea: Rect,
  surfaceSize: PetWindowSize,
  surfaceInsets?: PetSurfaceInsets,
): PetMotionState {
  const { left, right } = horizontalBounds(workArea, surfaceSize, surfaceInsets);
  const { top, bottom } = verticalBounds(workArea, surfaceSize);
  return {
    ...state,
    x: clamp(state.x, left, right),
    y: clamp(state.y, top, bottom),
    target: state.target
      ? {
          x: clamp(state.target.x, left, right),
          y: clamp(state.target.y, top, bottom),
        }
      : null,
  };
}

export function findAdjacentMonitor(
  workArea: Rect,
  monitors: readonly Rect[],
  edge: PetEdge,
): Rect | null {
  const perpendicularOverlap = (firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) =>
    Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));
  const maxGap = 80;

  return (
    monitors.find((candidate) => {
      if (candidate.x === workArea.x && candidate.y === workArea.y && candidate.width === workArea.width && candidate.height === workArea.height) {
        return false;
      }
      if (edge === 'left' || edge === 'right') {
        const candidateEdge = edge === 'left' ? candidate.x + candidate.width : candidate.x;
        const currentEdge = edge === 'left' ? workArea.x : workArea.x + workArea.width;
        return (
          Math.abs(candidateEdge - currentEdge) <= maxGap &&
          perpendicularOverlap(workArea.y, workArea.y + workArea.height, candidate.y, candidate.y + candidate.height) >= 64
        );
      }
      const candidateEdge = edge === 'top' ? candidate.y + candidate.height : candidate.y;
      const currentEdge = edge === 'top' ? workArea.y : workArea.y + workArea.height;
      return (
        Math.abs(candidateEdge - currentEdge) <= maxGap &&
        perpendicularOverlap(workArea.x, workArea.x + workArea.width, candidate.x, candidate.x + candidate.width) >= 64
      );
    }) ?? null
  );
}

export function resolvePetMotion({
  state,
  workArea,
  surfaceSize,
  surfaceInsets,
  speedPx = 8,
  autonomousWalking,
  reducedMotion,
  paused,
  nowMs = Date.now(),
  random = Math.random,
}: {
  state: PetMotionState;
  workArea: Rect;
  surfaceSize: PetWindowSize;
  surfaceInsets?: PetSurfaceInsets;
  speedPx?: number;
  autonomousWalking: boolean;
  reducedMotion: boolean;
  paused: boolean;
  nowMs?: number;
  random?: () => number;
}): PetMotionState {
  const clampedState = clampPetMotionToWorkArea(state, workArea, surfaceSize, surfaceInsets);
  if (reducedMotion || !autonomousWalking || paused) {
    return { ...clampedState, animation: 'idle' };
  }

  if (clampedState.mode !== 'moving' || !clampedState.target) {
    if (nowMs < clampedState.waitUntilMs) return { ...clampedState, animation: 'idle' };
    return {
      ...clampedState,
      mode: 'moving',
      target: chooseRoamTarget(workArea, surfaceSize, surfaceInsets, random),
      edge: null,
      animation: toAnimation(clampedState.direction),
    };
  }

  const deltaX = clampedState.target.x - clampedState.x;
  const deltaY = clampedState.target.y - clampedState.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= Math.max(1, speedPx)) {
    const arrived = clampPetMotionToWorkArea(
      { ...clampedState, x: clampedState.target.x, y: clampedState.target.y },
      workArea,
      surfaceSize,
      surfaceInsets,
    );
    const edge = edgeForPoint(arrived, workArea, surfaceSize, surfaceInsets);
    return {
      ...arrived,
      mode: edge ? 'edge-stopped' : 'dwelling',
      target: null,
      edge,
      edgeStopId: edge ? arrived.edgeStopId + 1 : arrived.edgeStopId,
      waitUntilMs: randomWait(
        nowMs,
        edge ? ROAM_EDGE_DWELL_MIN_MS : ROAM_DWELL_MIN_MS,
        edge ? ROAM_EDGE_DWELL_MAX_MS : ROAM_DWELL_MAX_MS,
        random,
      ),
      animation: 'idle',
    };
  }

  const step = Math.min(Math.max(1, speedPx), distance);
  const direction: PetDirection = deltaX < 0 ? -1 : deltaX > 0 ? 1 : clampedState.direction;
  return clampPetMotionToWorkArea(
    {
      ...clampedState,
      x: clampedState.x + (deltaX / distance) * step,
      y: clampedState.y + (deltaY / distance) * step,
      direction,
      edge: null,
      animation: toAnimation(direction),
    },
    workArea,
    surfaceSize,
    surfaceInsets,
  );
}
