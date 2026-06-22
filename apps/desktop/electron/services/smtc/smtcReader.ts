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
    options: { album?: string | null; durationMs?: number | null; positionMs?: number; at?: number },
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

/** Aplica un evento al sink. Pura respecto al parsing (testeable). */
export function dispatchSmtcEvent(ev: SmtcEvent, sink: SmtcSink, at: number = Date.now()): void {
  switch (ev.type) {
    case 'track':
      void sink.applyExternalTrack(ev.title, ev.artist, {
        album: ev.album,
        durationMs: ev.durationMs,
        positionMs: ev.positionMs,
        at,
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

/**
 * Lanza el sidecar SMTC y enruta sus eventos al sink. No-op fuera de Windows o
 * si el ejecutable no existe (SMTC simplemente queda deshabilitado y se usa AudD).
 */
export class SmtcReader {
  private proc: ChildProcess | null = null;
  private buf = '';

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

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 1);
        const ev = parseSmtcMessage(line);
        if (ev) dispatchSmtcEvent(ev, this.sink);
      }
    });
    this.proc.stderr?.on('data', (d: Buffer) => console.error('[smtc]', d.toString()));
    this.proc.on('exit', (code) => {
      console.warn('[smtc] sidecar finalizó con code', code);
      this.proc = null;
    });
    return true;
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }
}
