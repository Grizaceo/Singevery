import * as http from 'http';
import { describe, it, expect } from 'vitest';
import {
  buildDiagnosticsSnapshot,
  isLoopbackHost,
  resolveDiagnosticsPort,
  startDiagnosticsServer,
  type DiagnosticsSources,
} from '../electron/services/diagnostics/diagnosticsServer';
import type { StateDiagnostics } from '../electron/core/stateStore';

function stateFixture(overrides: Partial<StateDiagnostics> = {}): StateDiagnostics {
  return {
    status: 'DISPLAYING',
    overrideStatus: null,
    track: { title: 'アイドル', artist: 'YOASOBI', key: 'yoasobi::aidoru', aliasKeys: [] },
    lyrics: { source: 'lrclib', synced: true, lines: 76, translationLang: null },
    locked: true,
    provisional: false,
    titleDistinctiveness: 0.712345,
    identity: {
      wrongSong: null,
      requiredHits: 2,
      osStillConfirmsCurrent: false,
      recognitionSource: 'system',
      externalTrusted: true,
      externalInputSuppressed: false,
      lastExternalTitle: null,
      lastUnmatchedExternal: null,
      autoRetryPending: false,
    },
    sync: {
      displayedPositionMs: 42000,
      offsetMs: -250,
      calibrationOffsetMs: 0,
      paused: false,
      energy: null,
    },
    ...overrides,
  };
}

function sourcesFixture(state: StateDiagnostics = stateFixture()): DiagnosticsSources {
  return {
    appName: 'Singevery',
    appVersion: '0.2.1-beta.1',
    startedAt: Date.now() - 60_000,
    getState: () => state,
    getCachedTrack: () => ({
      key: 'yoasobi::aidoru',
      title: 'アイドル',
      artist: 'YOASOBI',
      source: 'lrclib',
      sourceKind: 'lrclib',
      sourcePriority: 1,
      synced: true,
      cachedAt: Date.now() - 5000,
      vintageMs: 5000,
      lastHeardAt: Date.now(),
      playCount: 3,
      bytes: 2048,
      negative: false,
    }),
    getProviderNames: () => ['lrclib', 'musixmatch', 'letras.mus.br'],
    getRecentAttempts: (limit) =>
      [
        {
          ts: '2026-08-04T10:00:00.000Z',
          type: 'identify' as const,
          source: 'shazam' as const,
          outcome: 'matched' as const,
          durationMs: 1200,
          confidence: 1,
          track: { title: 'アイドル', artist: 'YOASOBI' },
        },
        {
          ts: '2026-08-04T09:59:00.000Z',
          type: 'identify' as const,
          source: 'audd' as const,
          outcome: 'error' as const,
          error: 'Shazam no respondió en 15 s',
        },
      ].slice(0, limit),
  };
}

describe('buildDiagnosticsSnapshot', () => {
  it('expone pista, fuente, antigüedad y estado de lock', () => {
    const snap = buildDiagnosticsSnapshot(sourcesFixture());
    expect(snap.matched?.title).toBe('アイドル');
    expect(snap.matched?.source).toBe('lrclib');
    expect(snap.matched?.sourceKind).toBe('lrclib');
    expect(snap.matched?.sourcePriority).toBe(1);
    expect(snap.matched?.vintageMs).toBe(5000);
    expect(snap.matched?.locked).toBe(true);
    expect(snap.matched?.provisional).toBe(false);
    // El puntaje se redondea para que el JSON sea legible.
    expect(snap.matched?.titleDistinctiveness).toBe(0.712);
  });

  it('traduce el matchlog a intentos con motivo de fallo', () => {
    const snap = buildDiagnosticsSnapshot(sourcesFixture());
    expect(snap.recent).toHaveLength(2);
    expect(snap.recent[0]).toMatchObject({ method: 'shazam', result: 'matched', confidence: 1 });
    expect(snap.recent[1].whyFailed).toBe('Shazam no respondió en 15 s');
    expect(snap.recent[1].confidence).toBeNull();
  });

  it('refleja una pista provisional (título genérico)', () => {
    const snap = buildDiagnosticsSnapshot(
      sourcesFixture(stateFixture({ locked: false, provisional: true, titleDistinctiveness: 0.07 })),
    );
    expect(snap.matched?.locked).toBe(false);
    expect(snap.matched?.provisional).toBe(true);
  });

  it('sin pista cargada devuelve matched null sin romperse', () => {
    const snap = buildDiagnosticsSnapshot(
      sourcesFixture(stateFixture({ track: null, lyrics: null, locked: false })),
    );
    expect(snap.matched).toBeNull();
    expect(snap.playing.status).toBe('DISPLAYING');
    expect(snap.state.providerChain).toContain('lrclib');
  });

  it('limita la cantidad de intentos pedidos', () => {
    const snap = buildDiagnosticsSnapshot(sourcesFixture(), { recentLimit: 1 });
    expect(snap.recent).toHaveLength(1);
    // Un límite negativo no debe reventar ni pedir el log entero.
    expect(buildDiagnosticsSnapshot(sourcesFixture(), { recentLimit: -5 }).recent).toHaveLength(0);
  });
});

describe('resolveDiagnosticsPort', () => {
  it('apagado por defecto', () => {
    expect(resolveDiagnosticsPort({})).toBeNull();
    expect(resolveDiagnosticsPort({ SINGEVERY_DEBUG_PORT: '  ' })).toBeNull();
  });

  it('acepta un puerto válido', () => {
    expect(resolveDiagnosticsPort({ SINGEVERY_DEBUG_PORT: '5199' })).toBe(5199);
  });

  it('ignora basura en vez de tumbar el arranque', () => {
    for (const value of ['abc', '0', '70000', '-1', '80.5']) {
      expect(resolveDiagnosticsPort({ SINGEVERY_DEBUG_PORT: value }), value).toBeNull();
    }
  });
});

describe('isLoopbackHost', () => {
  it('acepta solo loopback', () => {
    expect(isLoopbackHost('127.0.0.1:5199')).toBe(true);
    expect(isLoopbackHost('localhost:5199')).toBe(true);
    expect(isLoopbackHost('[::1]:5199')).toBe(true);
  });

  it('rechaza dominios externos (DNS rebinding)', () => {
    expect(isLoopbackHost('malicioso.tld')).toBe(false);
    expect(isLoopbackHost('192.168.1.5:5199')).toBe(false);
    expect(isLoopbackHost('127.0.0.1.evil.tld')).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
  });
});

/** GET /debug con una cabecera Host arbitraria (fetch no permite fijarla). */
function statusWithHost(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/debug', method: 'GET', headers: { Host: host } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('servidor real', () => {
  it('sirve /debug y /health, y corta lo demás', async () => {
    const handle = await startDiagnosticsServer(sourcesFixture(), 0);
    expect(handle).not.toBeNull();
    try {
      const base = `http://127.0.0.1:${handle!.port}`;

      const debug = await fetch(`${base}/debug`);
      expect(debug.status).toBe(200);
      const body = (await debug.json()) as { matched: { title: string } };
      expect(body.matched.title).toBe('アイドル');

      expect((await fetch(`${base}/health`)).status).toBe(200);
      expect((await fetch(`${base}/otra-cosa`)).status).toBe(404);
      expect((await fetch(`${base}/debug`, { method: 'POST' })).status).toBe(405);

      // Host falsificado (DNS rebinding) → 403. Se usa http.request porque
      // fetch() prohíbe fijar la cabecera Host a mano.
      expect(await statusWithHost(handle!.port, 'malicioso.tld')).toBe(403);
      expect(await statusWithHost(handle!.port, '127.0.0.1')).toBe(200);
    } finally {
      await handle!.close();
    }
  });

  it('no arranca nada si el puerto es null', async () => {
    expect(await startDiagnosticsServer(sourcesFixture(), null)).toBeNull();
  });
});
