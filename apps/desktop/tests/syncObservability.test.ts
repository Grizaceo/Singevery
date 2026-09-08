import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncClock } from '../electron/core/syncClock';
import { NULL_OFFSET_STORE, NULL_CALIBRATION_STORE } from '../electron/services/settings';
import { recognitionLogFields } from '../electron/core/matchLog';
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
afterEach(() => vi.restoreAllMocks());
describe('sync observability', () => {
  it('records pause ownership, resume and anchor without logging repeated levels', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const clock = new SyncClock(NULL_OFFSET_STORE, NULL_CALIBRATION_STORE);
    clock.reanchor(1000, 0);
    clock.pauseClock(100, 'silence');
    clock.pauseClock(200, 'external');
    clock.pauseClock(300, 'external');
    expect(clock.getDiagnostics()).toMatchObject({ paused: true, pauseSource: 'external', anchoredAt: 100, correctionTargetMs: 0 });
    clock.reportAudioLevel(0.8, 500);
    expect(clock.isClockPaused()).toBe(true);
    clock.resumeClock(600, 'external');
    expect(clock.getDiagnostics()).toMatchObject({ paused: false, pauseSource: null, anchoredAt: 600 });
    expect(clock.getDisplayedPosition(700)).toBe(1200);
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.flat().join(' ')).toContain('external');
  });
  it('attributes a successful auto match to its actual provider and preserves raw timing', () => {
    expect(recognitionLogFields({ track: { provider: 'shazam', provider_track_id: 's', title: 'Song', artist: 'Artist' }, position_ms: 50000, sample_offset_ms: 6000, matched_at: 8000, confidence: 1 }, 1000, 'auto')).toEqual({ source: 'shazam', position_ms: 50000, sample_offset_ms: 6000, matched_at: 8000, recordStartedAt: 1000 });
    expect(recognitionLogFields(null, 1000, 'auto')).toEqual({ source: 'auto', recordStartedAt: 1000 });
  });
});
