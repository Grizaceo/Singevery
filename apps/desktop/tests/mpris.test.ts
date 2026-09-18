import { describe, it, expect } from 'vitest';
import {
  MprisReader,
  MPRIS_STALE_GRACE_MS,
  emptyMprisTracker,
  mprisEvents,
  parseMprisNames,
  parseMprisProperties,
  pickMprisPlayer,
  type MprisSnapshot,
} from '../electron/services/mpris/mprisReader';
import type { SmtcSink } from '../electron/services/smtc/smtcReader';

/** Respuesta de busctl GetAll con la forma real de Spotify / Firefox. */
function getAllJson(opts: {
  status: string;
  title?: string;
  artist?: string[];
  album?: string;
  lengthUs?: number;
  positionUs?: number | null;
}): string {
  const meta: Record<string, unknown> = {
    'mpris:trackid': { type: 'o', data: '/org/mpris/MediaPlayer2/firefox' },
  };
  if (opts.title != null) meta['xesam:title'] = { type: 's', data: opts.title };
  if (opts.artist != null) meta['xesam:artist'] = { type: 'as', data: opts.artist };
  if (opts.album != null) meta['xesam:album'] = { type: 's', data: opts.album };
  if (opts.lengthUs != null) meta['mpris:length'] = { type: 'x', data: opts.lengthUs };
  const props: Record<string, unknown> = {
    PlaybackStatus: { type: 's', data: opts.status },
    Metadata: { type: 'a{sv}', data: meta },
    Rate: { type: 'd', data: 1 },
  };
  if (opts.positionUs !== null) props.Position = { type: 'x', data: opts.positionUs ?? 0 };
  return JSON.stringify({ type: 'a{sv}', data: [props] });
}

function snap(partial: Partial<MprisSnapshot>): MprisSnapshot {
  return {
    name: 'org.mpris.MediaPlayer2.spotify',
    status: 'Playing',
    title: 'Silhouette',
    artist: 'KANA-BOON',
    album: 'Origin',
    durationMs: 200_000,
    positionMs: 10_000,
    at: 1_000_000,
    ...partial,
  };
}

describe('parseMprisNames', () => {
  it('se queda con los reproductores MPRIS y excluye la sesión de la propia app', () => {
    const stdout = JSON.stringify({
      type: 'as',
      data: [
        [
          'org.freedesktop.DBus',
          ':1.42',
          'org.mpris.MediaPlayer2.spotify',
          'org.mpris.MediaPlayer2.firefox.instance_1_128',
          'org.mpris.MediaPlayer2.chromium.instance4242',
        ],
      ],
    });
    expect(parseMprisNames(stdout, 4242)).toEqual([
      'org.mpris.MediaPlayer2.spotify',
      'org.mpris.MediaPlayer2.firefox.instance_1_128',
    ]);
  });

  it('salida inválida → lista vacía', () => {
    expect(parseMprisNames('', 1)).toEqual([]);
    expect(parseMprisNames('{"type":"as","data":[]}', 1)).toEqual([]);
  });
});

describe('parseMprisProperties', () => {
  it('convierte µs a ms y une varios artistas', () => {
    const s = parseMprisProperties(
      'org.mpris.MediaPlayer2.spotify',
      getAllJson({
        status: 'Playing',
        title: 'シルエット',
        artist: ['KANA-BOON', 'Invitado'],
        album: 'TIME',
        lengthUs: 89_900_000,
        positionUs: 7_585_000,
      }),
      123,
    );
    expect(s).toEqual({
      name: 'org.mpris.MediaPlayer2.spotify',
      status: 'Playing',
      title: 'シルエット',
      artist: 'KANA-BOON, Invitado',
      album: 'TIME',
      durationMs: 89_900,
      positionMs: 7_585,
      at: 123,
    });
  });

  it('álbum vacío (YouTube en el navegador) → null; sin Position → null', () => {
    const s = parseMprisProperties(
      'org.mpris.MediaPlayer2.firefox.instance_1_128',
      getAllJson({ status: 'Paused', title: 'Video', artist: ['Canal'], album: '', positionUs: null }),
      0,
    );
    expect(s?.album).toBeNull();
    expect(s?.positionMs).toBeNull();
    expect(s?.durationMs).toBeNull();
    expect(s?.status).toBe('Paused');
  });

  it('estado desconocido cuenta como detenido', () => {
    expect(parseMprisProperties('x', getAllJson({ status: 'Buffering', title: 'a' }), 0)?.status).toBe('Stopped');
  });

  it('JSON roto → null', () => {
    expect(parseMprisProperties('x', 'Call failed: The name is not activatable', 0)).toBeNull();
  });
});

describe('pickMprisPlayer', () => {
  const spotify = snap({ name: 'spotify', status: 'Paused' });
  const zen = snap({ name: 'zen', status: 'Paused', title: 'Video' });

  it('sigue al actual mientras suena', () => {
    expect(pickMprisPlayer([{ ...zen, status: 'Playing' }, { ...spotify, status: 'Playing' }], 'spotify')).toBe('spotify');
  });

  it('cambia al que empezó a sonar', () => {
    expect(pickMprisPlayer([spotify, { ...zen, status: 'Playing' }], 'spotify')).toBe('zen');
  });

  it('nadie suena: conserva el actual en pausa', () => {
    expect(pickMprisPlayer([zen, spotify], 'spotify')).toBe('spotify');
  });

  it('sin actual: el primero en pausa con metadata; ignora sesiones vacías', () => {
    const empty = snap({ name: 'vacio', status: 'Stopped', title: '', artist: '' });
    expect(pickMprisPlayer([empty, zen], null)).toBe('zen');
    expect(pickMprisPlayer([empty], null)).toBeNull();
  });
});

describe('mprisEvents', () => {
  it('primera lectura emite track con posición y duración', () => {
    const { events } = mprisEvents(snap({}), emptyMprisTracker());
    expect(events).toEqual([
      {
        type: 'track',
        title: 'Silhouette',
        artist: 'KANA-BOON',
        album: 'Origin',
        durationMs: 200_000,
        positionMs: 10_000,
        playing: true,
      },
    ]);
  });

  it('misma pista: solo posición (dedupe de metadata repetida)', () => {
    const first = mprisEvents(snap({}), emptyMprisTracker());
    const { events } = mprisEvents(snap({ positionMs: 11_000, at: 1_001_000 }), first.tracker);
    expect(events).toEqual([{ type: 'position', positionMs: 11_000, playing: true }]);
  });

  it('pausa: emite playback y la posición con playing=false', () => {
    const first = mprisEvents(snap({}), emptyMprisTracker());
    const { events } = mprisEvents(snap({ status: 'Paused', at: 1_001_000 }), first.tracker);
    expect(events).toEqual([
      { type: 'playback', playing: false },
      { type: 'position', positionMs: 10_000, playing: false },
    ]);
  });

  it('metadata sin identidad no emite track', () => {
    const { events } = mprisEvents(snap({ title: '', artist: '' }), emptyMprisTracker());
    expect(events).toEqual([]);
  });

  it('posición mayor que la duración se acota', () => {
    const { events } = mprisEvents(snap({ positionMs: 250_000 }), emptyMprisTracker());
    expect(events[0]).toMatchObject({ type: 'track', positionMs: 200_000 });
  });

  it('timeline viejo tras cambiar de pista: track en 0 y se calla hasta que la posición se refresca', () => {
    // Pista A sonando en 120 s.
    const a = mprisEvents(snap({ positionMs: 120_000, at: 1_000_000 }), emptyMprisTracker());
    // 1 s después cambia la metadata, pero Position sigue siendo la de A (121 s).
    const b = mprisEvents(
      snap({ title: 'Otra', artist: 'Otro', album: null, positionMs: 121_000, at: 1_001_000 }),
      a.tracker,
    );
    expect(b.events).toEqual([
      { type: 'track', title: 'Otra', artist: 'Otro', album: null, durationMs: 200_000, positionMs: 0, playing: true },
    ]);
    // Siguiente tick todavía viejo (122 s): sin evento de posición.
    const c = mprisEvents(snap({ title: 'Otra', artist: 'Otro', album: null, positionMs: 122_000, at: 1_002_000 }), b.tracker);
    expect(c.events).toEqual([]);
    // El reproductor refresca: 2 s de la pista nueva → vuelve a fluir.
    const d = mprisEvents(snap({ title: 'Otra', artist: 'Otro', album: null, positionMs: 2_000, at: 1_003_000 }), c.tracker);
    expect(d.events).toEqual([{ type: 'position', positionMs: 2_000, playing: true }]);
  });

  it('pasado el plazo de gracia se acepta la posición aunque siga pareciendo vieja', () => {
    const a = mprisEvents(snap({ positionMs: 120_000, at: 1_000_000 }), emptyMprisTracker());
    const b = mprisEvents(snap({ title: 'Otra', positionMs: 121_000, at: 1_001_000 }), a.tracker);
    const late = 1_001_000 + MPRIS_STALE_GRACE_MS + 1;
    const c = mprisEvents(snap({ title: 'Otra', positionMs: 121_000 + (late - 1_001_000), at: late }), b.tracker);
    expect(c.events).toEqual([{ type: 'position', positionMs: 121_000 + (late - 1_001_000), playing: true }]);
  });

  it('una pista que empieza cerca de 0 nunca se toma por vieja', () => {
    const a = mprisEvents(snap({ positionMs: 500, at: 1_000_000 }), emptyMprisTracker());
    const b = mprisEvents(snap({ title: 'Otra', positionMs: 1_500, at: 1_001_000 }), a.tracker);
    expect(b.events[0]).toMatchObject({ type: 'track', positionMs: 1_500 });
  });
});

describe('MprisReader', () => {
  function recordingSink() {
    const calls: string[] = [];
    const sink: SmtcSink = {
      applyExternalTrack: (title, artist, o) => {
        calls.push(`track ${title}/${artist} @${o.positionMs} ${o.playing ? 'play' : 'pause'}`);
        return true;
      },
      applyExternalPosition: (pos, playing) => {
        calls.push(`pos ${pos} ${playing ? 'play' : 'pause'}`);
      },
      setPlaybackState: (playing) => {
        calls.push(`playback ${playing ? 'play' : 'pause'}`);
      },
    };
    return { sink, calls };
  }

  it('sigue al reproductor que suena y reenvía sus eventos al sink', async () => {
    const players: Record<string, string> = {
      'org.mpris.MediaPlayer2.spotify': getAllJson({
        status: 'Playing',
        title: 'Silhouette',
        artist: ['KANA-BOON'],
        lengthUs: 200_000_000,
        positionUs: 30_000_000,
      }),
      'org.mpris.MediaPlayer2.firefox.instance_1_1': getAllJson({ status: 'Paused', title: 'Video', artist: ['Canal'] }),
    };
    const run = async (args: string[]): Promise<string> => {
      if (args.includes('ListNames')) {
        return JSON.stringify({ type: 'as', data: [[':1.1', ...Object.keys(players)]] });
      }
      const out = players[args[1]];
      if (!out) throw new Error('Call failed: The name is not activatable');
      return out;
    };
    const { sink, calls } = recordingSink();
    const reader = new MprisReader(sink, run, 999, 'linux');

    await reader.poll();
    expect(calls).toEqual(['track Silhouette/KANA-BOON @30000 play']);

    players['org.mpris.MediaPlayer2.spotify'] = getAllJson({
      status: 'Paused',
      title: 'Silhouette',
      artist: ['KANA-BOON'],
      lengthUs: 200_000_000,
      positionUs: 31_000_000,
    });
    await reader.poll();
    expect(calls.slice(1)).toEqual(['playback pause', 'pos 31000 pause']);
  });

  it('sin busctl se desactiva sin lanzar', async () => {
    const run = async (): Promise<string> => {
      throw Object.assign(new Error('spawn busctl ENOENT'), { code: 'ENOENT' });
    };
    const { sink, calls } = recordingSink();
    const reader = new MprisReader(sink, run, 1, 'linux');
    await expect(reader.poll()).resolves.toBeUndefined();
    await reader.poll();
    expect(calls).toEqual([]);
  });

  it('fuera de Linux no arranca', () => {
    const { sink } = recordingSink();
    expect(new MprisReader(sink, async () => '', 1, 'win32').start()).toBe(false);
  });
});
