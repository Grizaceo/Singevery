import { describe, it, expect } from 'vitest';
import { adjustMatchPosition, projectAnchoredPosition } from '../electron/core/syncTiming';
import type { TrackMatch } from '../src/types';

describe('syncTiming', () => {
  it('suma el tiempo de grabación al timecode de AudD', () => {
    const match: TrackMatch = {
      track: {
        provider: 'audd',
        provider_track_id: 'x',
        title: 'T',
        artist: 'A',
      },
      confidence: 1,
      position_ms: 10_000,
      matched_at: 20_000,
    };
    const { positionMs, anchorAt } = adjustMatchPosition(match, 14_000);
    expect(anchorAt).toBe(20_000);
    expect(positionMs).toBe(10_000 + (20_000 - 14_000) + 300);
  });

  it('proyecta la posición tras fetch de letra', () => {
    const projected = projectAnchoredPosition(5000, 1000, 2500);
    expect(projected.positionMs).toBe(6500);
    expect(projected.anchorAt).toBe(2500);
  });
});
