import type { TrackMatch } from '../../src/types';

export type RecognitionPhase = 'LISTENING' | 'IDENTIFYING' | null;

/** Compensa latencia de grabación + identificación (ms). */
export const SYNC_OFFSET_MS = 300;

export function adjustMatchPosition(
  match: TrackMatch,
  recordStartedAt: number,
): { positionMs: number; anchorAt: number } {
  const anchorAt = match.matched_at;
  const elapsed = anchorAt - recordStartedAt;
  return {
    positionMs: match.position_ms + Math.max(0, elapsed) + SYNC_OFFSET_MS,
    anchorAt,
  };
}

/** Proyecta la posición anclada al momento actual (p. ej. tras fetch de letra). */
export function projectAnchoredPosition(
  positionMs: number,
  anchoredAt: number,
  at = Date.now(),
): { positionMs: number; anchorAt: number } {
  return {
    positionMs: positionMs + Math.max(0, at - anchoredAt),
    anchorAt: at,
  };
}
