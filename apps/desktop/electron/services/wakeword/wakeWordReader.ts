// ============================================================================
// Wake word reader — comando "SING" por voz (OPCIONAL, opt-in).
//
// El default del comando SING es sin micrófono: hotkey global (Ctrl+Alt+S) y
// clic en la pill. La activación por voz es opt-in y corre 100% local en un
// sidecar (p. ej. openWakeWord) que NO graba ni envía audio: solo escucha la
// palabra clave y, al detectarla, imprime un evento por stdout.
//
// Protocolo (una línea por evento):
//   {"type":"wake"}
//
// El sidecar vive en native/wakeword/. Si no está configurado (env
// WAKEWORD_SIDECAR) o no existe, este reader es no-op: el comando SING sigue
// disponible por hotkey y por la pill.
// ============================================================================

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs';

/** true si la línea es un evento de wake. Pura (testeable). */
export function parseWakeMessage(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t === 'WAKE') return true; // formato simple alternativo
  try {
    const m = JSON.parse(t) as Record<string, unknown>;
    return m.type === 'wake';
  } catch {
    return false;
  }
}

export class WakeWordReader {
  private proc: ChildProcess | null = null;
  private buf = '';

  constructor(
    private readonly onWake: () => void,
    private readonly exePath: string,
  ) {}

  start(): boolean {
    if (!this.exePath || !fs.existsSync(this.exePath)) {
      if (this.exePath) {
        console.warn('[wakeword] sidecar no encontrado, voz deshabilitada:', this.exePath);
      }
      return false;
    }
    try {
      this.proc = spawn(this.exePath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      console.error('[wakeword] no se pudo lanzar el sidecar:', err);
      return false;
    }

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 1);
        if (parseWakeMessage(line)) this.onWake();
      }
    });
    this.proc.stderr?.on('data', (d: Buffer) => console.error('[wakeword]', d.toString()));
    this.proc.on('exit', (code) => {
      console.warn('[wakeword] sidecar finalizó con code', code);
      this.proc = null;
    });
    return true;
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }
}
