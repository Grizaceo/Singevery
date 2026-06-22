import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import {
  parseSmtcMessage,
  dispatchSmtcEvent,
  type SmtcEvent,
  type SmtcSink,
} from '../electron/services/smtc/smtcReader';
import { StateStore } from '../electron/core/stateStore';
import { LyricsService } from '../electron/services/lyrics/lyricsService';
import type { LyricsProvider } from '../electron/services/lyrics/types';

const SYNCED_LRC = '[00:00.00]hello\n[00:03.00]world';
const fakeProvider: LyricsProvider = {
  name: 'fake',
  lookup: async () => ({ source: 'lrclib', synced: true, lrc: SYNCED_LRC }),
};

describe('parseSmtcMessage', () => {
  it('parsea track/position/playback', () => {
    expect(parseSmtcMessage('{"type":"track","title":"T","artist":"A"}')).toMatchObject({
      type: 'track',
      title: 'T',
      artist: 'A',
      playing: true,
    });
    expect(parseSmtcMessage('{"type":"position","positionMs":1200,"playing":false}')).toEqual({
      type: 'position',
      positionMs: 1200,
      playing: false,
    });
    expect(parseSmtcMessage('{"type":"playback","playing":false}')).toEqual({
      type: 'playback',
      playing: false,
    });
  });

  it('descarta líneas inválidas o vacías', () => {
    expect(parseSmtcMessage('')).toBeNull();
    expect(parseSmtcMessage('no json')).toBeNull();
    expect(parseSmtcMessage('{"type":"track","title":"T"}')).toBeNull(); // sin artist
  });
});

describe('dispatchSmtcEvent', () => {
  it('enruta cada tipo al método correcto del sink', () => {
    const calls: string[] = [];
    const sink: SmtcSink = {
      applyExternalTrack: async () => {
        calls.push('track');
        return true;
      },
      applyExternalPosition: () => calls.push('position'),
      setPlaybackState: () => calls.push('playback'),
    };
    const events: SmtcEvent[] = [
      { type: 'track', title: 'T', artist: 'A', album: null, durationMs: null, positionMs: 0, playing: true },
      { type: 'position', positionMs: 100, playing: true },
      { type: 'playback', playing: false },
    ];
    events.forEach((e) => dispatchSmtcEvent(e, sink));
    expect(calls).toEqual(['track', 'position', 'playback']);
  });
});

describe('StateStore — fuente externa (SMTC)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('applyExternalPosition ancla a la posición del SO (cubre el seek)', () => {
    const s = new StateStore(null);
    s.nudgePosition(10_000); // pos 10s
    s.applyExternalPosition(50_000, true, 0); // SO dice 50s → snap
    expect(s.getDisplayedPosition(0)).toBe(50_000);
  });

  it('setPlaybackState pausa y reanuda el reloj', () => {
    const s = new StateStore(null);
    s.nudgePosition(10_000);
    s.setPlaybackState(false, 0); // pausa
    vi.setSystemTime(5_000);
    expect(s.getDisplayedPosition(5_000)).toBe(10_000); // congelado
    s.setPlaybackState(true, 5_000); // reanuda
    vi.setSystemTime(7_000);
    expect(s.getDisplayedPosition(7_000)).toBe(12_000);
  });

  it('applyExternalTrack: misma pista reconcilia, distinta recarga', async () => {
    const svc = new LyricsService(undefined, [fakeProvider]);
    const s = new StateStore(null, undefined, svc);
    await s.loadLyricsByMetadata('Song', 'Artist');

    const same = await s.applyExternalTrack('Song', 'Artist', { positionMs: 30_000, at: 0 });
    expect(same).toBe(false);
    expect(s.getDisplayedPosition(0)).toBe(30_000);

    const changed = await s.applyExternalTrack('Other', 'Band', { positionMs: 0, at: 0 });
    expect(changed).toBe(true);
  });
});
