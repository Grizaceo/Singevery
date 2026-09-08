import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
import { StateStore } from '../electron/core/stateStore';
import type { LyricsService } from '../electron/services/lyrics/lyricsService';
const lyrics = { synced: true, source: 'test', lines: [{start_ms: 0, text: 'one'}] };
let s: StateStore;
beforeEach(async () => { vi.useFakeTimers(); vi.setSystemTime(100000); s = new StateStore(null, undefined, { getLyrics: async () => lyrics } as unknown as LyricsService); await s.loadLyricsByMetadata('Known Song', 'Artist', 100000); });
afterEach(() => { s.stop(); vi.useRealTimers(); });
const match = (pos: number, at: number) => ({track: {provider:'shazam', provider_track_id:'s', title:'Known Song', artist:'Artist'}, position_ms:pos, sample_offset_ms:6000, matched_at:at, confidence:1});
it('quarantines a backward outlier, then accepts independently corroborated backward seek', async () => {
 await s.applyMatch(match(20000, 100000)); expect(s.getDisplayedPosition()).toBe(100000);
 await s.applyMatch(match(20000, 100000)); expect(s.getDisplayedPosition()).toBe(100000);
 vi.setSystemTime(110000); await s.applyMatch(match(30000, 110000)); expect(s.getDisplayedPosition()).toBe(30000);
});
it('quarantines forward seeks too, and recovery cancels old candidates', async () => {
 await s.applyMatch(match(200000,100000)); expect(s.getDisplayedPosition()).toBe(100000);
 vi.setSystemTime(110000); await s.applyMatch(match(110000,110000));
 vi.setSystemTime(120000); await s.applyMatch(match(220000,120000)); expect(s.getDisplayedPosition()).toBe(120000);
 vi.setSystemTime(130000); await s.applyMatch(match(230000,130000)); expect(s.getDisplayedPosition()).toBe(230000);
});
it('revokes mismatched SMTC pause, but noise cannot revoke trusted pause', async () => {
 s.setRecognitionSource('system'); await s.applyExternalTrack('Known Song','Artist',{playing:false});
 s.reportAudioLevel(0.8); expect(s.isClockPaused()).toBe(true);
 await s.applyExternalTrack('Other Song','Other Artist',{playing:false});
 s.reportAudioLevel(0.8); expect(s.isClockPaused()).toBe(false);
 expect(s.getDiagnostics().identity.externalTrusted).toBe(false);
});
it('does not adopt unrelated SMTC before audio identification in system mode', async () => {
 s.stop();
 const getLyrics = vi.fn(async () => lyrics);
 s = new StateStore(null, undefined, { getLyrics } as unknown as LyricsService);
 s.setRecognitionSource('system');
 await s.applyExternalTrack('Browser Compilation', 'Other Artist', {playing:false});
 expect(getLyrics).not.toHaveBeenCalled();
 expect(s.getDiagnostics().identity.externalTrusted).toBe(false);
 expect(s.isClockPaused()).toBe(false);
});
it('mode changes do not blindly trust obsolete metadata', async () => {
 s.setRecognitionSource('system'); await s.applyExternalTrack('Other Song','Other Artist');
 s.setRecognitionSource(null); s.setRecognitionSource('system');
 expect(s.getDiagnostics().identity.externalTrusted).toBe(false);
 s.setPlaybackState(false); expect(s.isClockPaused()).toBe(false);
});
