// ============================================================================
// diagnosticsServer.ts — endpoint HTTP local para inspeccionar el widget.
//
// Por qué existe: el widget es una ventanita sin barra de estado. Cuando la
// letra no calza o cambia de canción sola, lo único observable son tres líneas
// de texto. Todo lo que explica el fallo —qué está lockeado, de qué fuente
// salió la letra, cuánta deriva lleva el reloj, qué respondió el reconocedor—
// vive en memoria y se pierde. Este endpoint lo saca en JSON:
//
//   curl http://127.0.0.1:5199/debug
//
// APAGADO POR DEFECTO. Se enciende con SINGEVERY_DEBUG_PORT (variable de
// entorno o línea en el .env junto al ejecutable). Un puerto abierto siempre
// en una app instalada por terceros es superficie de ataque gratis: cualquier
// página web puede hacerle peticiones a 127.0.0.1.
//
// Defensas (todas necesarias, ninguna redundante):
//   - escucha SOLO en 127.0.0.1 (nunca 0.0.0.0);
//   - valida la cabecera Host: sin esto, un dominio que resuelva a 127.0.0.1
//     (DNS rebinding) puede hablar con el endpoint desde el navegador;
//   - sin cabeceras CORS: el navegador no deja leer la respuesta cross-origin;
//   - solo GET, y solo dos rutas.
// ============================================================================

import * as http from 'http';
import type { AddressInfo } from 'net';
import type { StateDiagnostics } from '../../core/stateStore';
import type { MatchLogEntry } from '../../core/matchLog';
import type { CachedLyricsInfo } from '../lyrics/types';

/** Un intento de identificación, tal como se expone en /debug. */
export interface DiagnosticsAttempt {
  at: string;
  /** Cómo se intentó: shazam, audd, smtc, manual. */
  method: string;
  result: string;
  confidence: number | null;
  track: { title: string; artist: string } | null;
  durationMs: number | null;
  /** Motivo del fallo cuando lo hubo (mensaje de error del proveedor). */
  whyFailed: string | null;
}

export interface DiagnosticsSnapshot {
  app: { name: string; version: string; uptimeMs: number };
  now: string;
  /** Pista con letra en pantalla y su procedencia. */
  matched: {
    title: string;
    artist: string;
    key: string | null;
    source: string | null;
    sourceKind: string | null;
    sourcePriority: number | null;
    /** Antigüedad de la letra cacheada (ms). null si no vino de caché. */
    vintageMs: number | null;
    synced: boolean | null;
    lines: number | null;
    locked: boolean;
    provisional: boolean;
    titleDistinctiveness: number | null;
  } | null;
  /** Lo que el widget cree que suena AHORA. */
  playing: {
    status: string;
    positionMs: number;
    paused: boolean;
    recognitionSource: string | null;
  };
  sync: StateDiagnostics['sync'];
  /** Estado del arbitraje de identidad (por qué NO cambió de canción). */
  state: StateDiagnostics['identity'] & { providerChain: string[] };
  recent: DiagnosticsAttempt[];
}

/** Fuentes de datos del snapshot. Se inyectan para poder testear sin Electron. */
export interface DiagnosticsSources {
  appName: string;
  appVersion: string;
  startedAt: number;
  getState(): StateDiagnostics;
  /** Ficha de caché de la pista actual (fuente, antigüedad). */
  getCachedTrack(key: string): CachedLyricsInfo | null;
  getProviderNames(): string[];
  getRecentAttempts(limit: number): MatchLogEntry[];
}

const DEFAULT_RECENT = 20;
const MAX_RECENT = 200;

function toAttempt(entry: MatchLogEntry): DiagnosticsAttempt {
  return {
    at: entry.ts,
    method: entry.source,
    result: entry.outcome,
    confidence: entry.confidence ?? null,
    track: entry.track ?? null,
    durationMs: entry.durationMs ?? null,
    whyFailed: entry.error ?? null,
  };
}

/** Arma el JSON de /debug. Función pura sobre las fuentes inyectadas. */
export function buildDiagnosticsSnapshot(
  sources: DiagnosticsSources,
  options: { recentLimit?: number; now?: number } = {},
): DiagnosticsSnapshot {
  const now = options.now ?? Date.now();
  const recentLimit = Math.min(MAX_RECENT, Math.max(0, options.recentLimit ?? DEFAULT_RECENT));
  const state = sources.getState();
  const cached = state.track?.key ? sources.getCachedTrack(state.track.key) : null;

  return {
    app: {
      name: sources.appName,
      version: sources.appVersion,
      uptimeMs: Math.max(0, now - sources.startedAt),
    },
    now: new Date(now).toISOString(),
    matched: state.track
      ? {
          title: state.track.title,
          artist: state.track.artist,
          key: state.track.key,
          // La fuente de la letra EN PANTALLA manda; la ficha de caché aporta
          // la antigüedad (una letra vieja explica matches que ya no calzan).
          source: state.lyrics?.source ?? cached?.source ?? null,
          sourceKind: cached?.sourceKind ?? null,
          sourcePriority: cached?.sourcePriority ?? null,
          vintageMs: cached?.vintageMs ?? null,
          synced: state.lyrics?.synced ?? null,
          lines: state.lyrics?.lines ?? null,
          locked: state.locked,
          provisional: state.provisional,
          titleDistinctiveness:
            state.titleDistinctiveness == null
              ? null
              : Number(state.titleDistinctiveness.toFixed(3)),
        }
      : null,
    playing: {
      status: state.overrideStatus ?? state.status,
      positionMs: state.sync.displayedPositionMs,
      paused: state.sync.paused,
      recognitionSource: state.identity.recognitionSource,
    },
    sync: state.sync,
    state: { ...state.identity, providerChain: sources.getProviderNames() },
    recent: sources.getRecentAttempts(recentLimit).map(toAttempt),
  };
}

/**
 * Puerto pedido por entorno, o null si el endpoint queda apagado (default).
 * Se valida el rango: un puerto basura debe dejar la app como estaba, no
 * tumbarla al arrancar.
 */
export function resolveDiagnosticsPort(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = (env.SINGEVERY_DEBUG_PORT ?? '').trim();
  if (!raw) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn(`[diagnostics] SINGEVERY_DEBUG_PORT inválido: "${raw}" (se ignora)`);
    return null;
  }
  return port;
}

/**
 * true si la cabecera Host apunta al loopback. Un navegador que visite
 * `http://malicioso.tld` cuyo DNS resuelva a 127.0.0.1 llegaría con
 * Host: malicioso.tld — y aquí se corta.
 */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  // Quita el puerto ("127.0.0.1:5199", "[::1]:5199").
  const withoutPort = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.split(':')[0];
  return withoutPort === '127.0.0.1' || withoutPort === 'localhost' || withoutPort === '[::1]';
}

export interface DiagnosticsServerHandle {
  port: number;
  close(): Promise<void>;
}

/**
 * Arranca el endpoint si `port` no es null. Nunca lanza: un fallo al abrir el
 * puerto (ocupado, bloqueado) deja la app funcionando sin diagnóstico.
 */
export async function startDiagnosticsServer(
  sources: DiagnosticsSources,
  port: number | null,
): Promise<DiagnosticsServerHandle | null> {
  if (port == null) return null;

  const server = http.createServer((req, res) => {
    const respond = (status: number, body: unknown): void => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(body, null, 2));
    };

    if (!isLoopbackHost(req.headers.host)) {
      respond(403, { error: 'solo loopback' });
      return;
    }
    if (req.method !== 'GET') {
      respond(405, { error: 'solo GET' });
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/debug') {
      const limitParam = Number(url.searchParams.get('recent'));
      try {
        respond(
          200,
          buildDiagnosticsSnapshot(sources, {
            recentLimit: Number.isFinite(limitParam) ? limitParam : undefined,
          }),
        );
      } catch (err) {
        // El diagnóstico nunca debe tumbar el proceso principal.
        respond(500, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    if (url.pathname === '/health') {
      respond(200, { ok: true, uptimeMs: Math.max(0, Date.now() - sources.startedAt) });
      return;
    }
    respond(404, { error: 'no existe', routes: ['/debug', '/health'] });
  });

  return new Promise((resolve) => {
    server.once('error', (err) => {
      console.error('[diagnostics] no se pudo abrir el endpoint:', err);
      resolve(null);
    });
    // Bind explícito al loopback: sin esto Node escucha en TODAS las interfaces
    // y el endpoint quedaría accesible desde la red local.
    server.listen(port, '127.0.0.1', () => {
      const actual = (server.address() as AddressInfo | null)?.port ?? port;
      console.log(`[diagnostics] endpoint en http://127.0.0.1:${actual}/debug`);
      resolve({
        port: actual,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
