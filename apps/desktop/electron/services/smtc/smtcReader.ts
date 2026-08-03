// ============================================================================
// SMTC reader — Capa b: el reproductor del SO como reloj maestro.
//
// Lee la sesión de medios de Windows (GlobalSystemMediaTransportControls) desde
// un sidecar nativo que emite JSON por líneas en stdout. El SO da metadata +
// playhead real + estado play/pausa con eventos, así que SMTC mata la deriva y
// reacciona a pausa/seek/skip al instante, SIN capturar audio ni gastar AudD.
//
// AudD queda como FALLBACK (vinilo, en vivo, web sin SMTC, micrófono).
//
// El sidecar (C#) vive en native/smtc/. Protocolo (una línea JSON por evento):
//   {"type":"track","title":"...","artist":"...","album":"...","durationMs":210000,"positionMs":0,"playing":true}
//   {"type":"position","positionMs":12345,"playing":true}
//   {"type":"playback","playing":false}
// ============================================================================

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs';

/** Lo que el reader necesita del StateStore (lo implementa StateStore). */
export interface SmtcSink {
  applyExternalTrack(
    title: string,
    artist: string,
    options: {
      album?: string | null;
      durationMs?: number | null;
      positionMs?: number;
      at?: number;
      playing?: boolean;
    },
  ): Promise<boolean> | boolean;
  applyExternalPosition(positionMs: number, playing: boolean, at?: number): void;
  setPlaybackState(playing: boolean, at?: number): void;
}

export type SmtcEvent =
  | {
      type: 'track';
      title: string;
      artist: string;
      album: string | null;
      durationMs: number | null;
      positionMs: number;
      playing: boolean;
    }
  | { type: 'position'; positionMs: number; playing: boolean }
  | { type: 'playback'; playing: boolean };

/** Parsea una línea del sidecar a un evento tipado. Pura (testeable). */
export function parseSmtcMessage(line: string): SmtcEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (m.type === 'track' && typeof m.title === 'string' && typeof m.artist === 'string') {
    return {
      type: 'track',
      title: m.title,
      artist: m.artist,
      album: typeof m.album === 'string' ? m.album : null,
      durationMs: typeof m.durationMs === 'number' ? m.durationMs : null,
      positionMs: typeof m.positionMs === 'number' ? m.positionMs : 0,
      playing: m.playing !== false,
    };
  }
  if (m.type === 'position' && typeof m.positionMs === 'number') {
    return { type: 'position', positionMs: m.positionMs, playing: m.playing !== false };
  }
  if (m.type === 'playback' && typeof m.playing === 'boolean') {
    return { type: 'playback', playing: m.playing };
  }
  return null;
}

/**
 * Filtro de posiciones CONGELADAS. La Position de SMTC es un snapshot; los
 * navegadores (YouTube) lo actualizan solo en play/pausa/seek, así que un
 * sidecar sin proyección re-emite el mismo valor cada segundo mientras la
 * canción avanza — y cada re-emisión tiraba la letra hacia atrás (rubber-band).
 * Un valor idéntico al anterior estando en reproducción no aporta información:
 * se descarta. Con el sidecar nuevo (posiciones proyectadas, siempre avanzan)
 * este filtro es un no-op. Función pura (testeable): devuelve el nuevo "último
 * valor" o null si el evento debe descartarse.
 */
export function nextForwardablePosition(
  ev: SmtcEvent,
  lastPositionMs: number | null,
): { forward: boolean; lastPositionMs: number | null } {
  if (ev.type === 'track') {
    // Cambio de pista: resetear el filtro (su posición inicial siempre pasa).
    return { forward: true, lastPositionMs: null };
  }
  if (ev.type !== 'position') return { forward: true, lastPositionMs };
  if (ev.playing && lastPositionMs != null && ev.positionMs === lastPositionMs) {
    return { forward: false, lastPositionMs };
  }
  return { forward: true, lastPositionMs: ev.positionMs };
}

/** Aplica un evento al sink. Pura respecto al parsing (testeable). */
export function dispatchSmtcEvent(ev: SmtcEvent, sink: SmtcSink, at: number = Date.now()): void {
  switch (ev.type) {
    case 'track':
      void sink.applyExternalTrack(ev.title, ev.artist, {
        album: ev.album,
        durationMs: ev.durationMs,
        positionMs: ev.positionMs,
        at,
        playing: ev.playing,
      });
      break;
    case 'position':
      sink.applyExternalPosition(ev.positionMs, ev.playing, at);
      break;
    case 'playback':
      sink.setPlaybackState(ev.playing, at);
      break;
  }
}

// ============================================================================
// Watchdog de liveness del sidecar. El sidecar emite un heartbeat cada 5 s;
// si no llega NADA (ni heartbeat ni eventos) en HEARTBEAT_TIMEOUT_MS, el
// proceso está muerto o colgado: se mata y se relanza con backoff. Antes de
// esto, un sidecar caído dejaba la app en fallback silencioso para siempre.
// ============================================================================

/** Periodo del heartbeat del sidecar (Program.cs: 5 s). */
export const SMTC_HEARTBEAT_MS = 5000;
/** Sin actividad por 4 heartbeats → el sidecar se considera caído. */
export const SMTC_HEARTBEAT_TIMEOUT_MS = SMTC_HEARTBEAT_MS * 4;
/** Frecuencia del chequeo del watchdog. */
export const SMTC_WATCHDOG_INTERVAL_MS = SMTC_HEARTBEAT_MS;
/** Reintentos máximos antes de rendirse y dejar SMTC deshabilitado. */
export const SMTC_MAX_RESTARTS = 3;
/** Backoff base del reintento (se duplica por intento). */
export const SMTC_RESTART_BASE_MS = 1000;
/** Techo del backoff. */
export const SMTC_RESTART_MAX_MS = 30000;

/** Backoff del reintento: base * 2^(attempt-1), con techo. Pura (testeable). */
export function nextRestartDelay(attempt: number, baseMs = SMTC_RESTART_BASE_MS, maxMs = SMTC_RESTART_MAX_MS): number {
  if (attempt <= 0) return 0;
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

/**
 * Lanza el sidecar SMTC y enruta sus eventos al sink. No-op fuera de Windows o
 * si el ejecutable no existe (SMTC simplemente queda deshabilitado y se usa AudD).
 */
export class SmtcReader {
  private proc: ChildProcess | null = null;
  private buf = '';
  /** Última posición reenviada (filtro de snapshots congelados). */
  private lastPositionMs: number | null = null;
  /** Última actividad (cualquier línea) del sidecar: base del watchdog. */
  private lastActivityAt = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private restarts = 0;
  private stopping = false;

  constructor(
    private readonly sink: SmtcSink,
    private readonly exePath: string,
  ) {}

  start(): boolean {
    if (process.platform !== 'win32') return false;
    if (!this.exePath || !fs.existsSync(this.exePath)) {
      console.warn('[smtc] sidecar no encontrado, SMTC deshabilitado:', this.exePath);
      return false;
    }
    try {
      this.proc = spawn(this.exePath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      console.error('[smtc] no se pudo lanzar el sidecar:', err);
      return false;
    }
    this.lastActivityAt = Date.now();
    this.stopping = false;
    this.ensureWatchdog();

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.lastActivityAt = Date.now();
      this.buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 1);
        const ev = parseSmtcMessage(line);
        if (!ev) continue;
        const { forward, lastPositionMs } = nextForwardablePosition(ev, this.lastPositionMs);
        this.lastPositionMs = lastPositionMs;
        if (forward) dispatchSmtcEvent(ev, this.sink);
      }
    });
    this.proc.stderr?.on('data', (d: Buffer) => console.error('[smtc]', d.toString()));
    this.proc.on('exit', (code) => {
      console.warn('[smtc] sidecar finalizó con code', code);
      this.proc = null;
      // No se reintenta aquí: el watchdog detecta la ausencia de heartbeat y
      // decide el reintento con backoff. Un solo camino de reintento evita
      // bucles apretados si el sidecar muere en bucle al arrancar.
    });
    return true;
  }

  /** Chequea que el sidecar siga vivo (heartbeat) y lo relanza si no. */
  private checkHealth = (): void => {
    if (this.stopping || !this.proc) return;
    const idleMs = Date.now() - this.lastActivityAt;
    if (idleMs > SMTC_HEARTBEAT_TIMEOUT_MS) {
      console.warn(
        `[smtc] sin actividad del sidecar por ${idleMs} ms (heartbeat cada ${SMTC_HEARTBEAT_MS} ms); relanzando (intento ${this.restarts + 1}/${SMTC_MAX_RESTARTS})`,
      );
      this.restart();
    }
  };

  private ensureWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(this.checkHealth, SMTC_WATCHDOG_INTERVAL_MS);
    this.watchdog.unref?.();
  }

  private restart(): void {
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* ya murió entre medias */
      }
    }
    if (this.restarts >= SMTC_MAX_RESTARTS) {
      console.error('[smtc] se agotaron los reintentos; SMTC deshabilitado (queda AudD como fuente)');
      this.stop();
      return;
    }
    this.restarts += 1;
    const delay = nextRestartDelay(this.restarts);
    setTimeout(() => {
      if (this.stopping) return;
      const ok = this.start();
      if (!ok && this.restarts < SMTC_MAX_RESTARTS) {
        // El lanzamiento falló (exe no existe o spawn falló): reintentar igual,
        // el backoff ya avanzó y el siguiente intento espera más.
        this.restart();
      }
    }, delay);
  }

  stop(): void {
    this.stopping = true;
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    const proc = this.proc;
    this.proc = null;
    if (!proc) return;
    proc.kill();
    proc.unref();
    // Respaldo: en Windows, SIGTERM a procesos nativos puede ser ignorado.
    // Si el sidecar sigue vivo tras 500 ms, matarlo con SIGKILL (forzoso).
    const t = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ya murió entre medias */
        }
      }
    }, 500);
    t.unref?.();
  }
}
