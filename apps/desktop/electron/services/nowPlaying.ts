// ============================================================================
// nowPlaying.ts — posición exacta del reproductor vía Windows SMTC (Fase 1.5).
//
// Windows expone el "Now Playing" de CUALQUIER app (Spotify, navegador, etc.)
// por GlobalSystemMediaTransportControlsSessionManager (WinRT). En vez de un
// módulo nativo (node-gyp), lanzamos un PowerShell de larga vida que consulta
// SMTC cada ~1 s y emite una línea JSON por stdout. El proceso main la parsea.
//
// Es la fuente de posición más precisa: da título/artista + posición + play/pause
// continuamente, sin deriva.
//
// FUNCIONA EN WSL2 TAMBIÉN: aunque el proceso Electron corre bajo Linux,
// `powershell.exe` es alcanzable por el interop de Windows (`/mnt/c/...` en el
// PATH) y ejecuta WinRT contra el Windows host. Verificado: devuelve el Now
// Playing real de cualquier app de media del Windows anfitrión. Así una sola
// base de código sincroniza solo en WSL y en Windows nativo, sin loopback ni
// AudD. No-op en Linux real (sin interop) y en macOS.
// ============================================================================

import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';

export interface NowPlaying {
  title: string;
  artist: string;
  /** Posición proyectada a "ahora" (ms dentro de la canción). */
  positionMs: number;
  /** Momento (epoch ms) en que `positionMs` es válido (~ahora). */
  atEpochMs: number;
  playing: boolean;
  durationMs?: number;
}

// Script WinRT. Se construye por líneas para poder incluir el backtick de
// `IAsyncOperation`1` y comillas dobles sin romper el literal de TS.
const PS_LINES = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  "$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
  'function Await($op, $t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }',
  '[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null',
  '$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])',
  'while ($true) {',
  '  try {',
  '    $s = $mgr.GetCurrentSession()',
  '    if ($null -eq $s) { Write-Output \'{"none":true}\' }',
  '    else {',
  '      $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])',
  '      $tl = $s.GetTimelineProperties()',
  '      $pb = $s.GetPlaybackInfo()',
  '      $playing = ($pb -ne $null -and $pb.PlaybackStatus -eq 4)',
  '      $obj = [ordered]@{ title = $props.Title; artist = $props.Artist; positionMs = [int64]$tl.Position.TotalMilliseconds; endMs = [int64]$tl.EndTime.TotalMilliseconds; lastUpdatedMs = $tl.LastUpdatedTime.ToUnixTimeMilliseconds(); playing = $playing }',
  '      Write-Output ($obj | ConvertTo-Json -Compress)',
  '    }',
  '  } catch { Write-Output \'{"error":true}\' }',
  '  Start-Sleep -Milliseconds 1000',
  '}',
];

interface RawSmtc {
  none?: boolean;
  error?: boolean;
  title?: string;
  artist?: string;
  positionMs?: number;
  endMs?: number;
  lastUpdatedMs?: number;
  playing?: boolean;
}

let _canUseSmtcCache: boolean | null = null;

/**
 * ¿Podemos leer SMTC desde aquí?
 * - Windows nativo (`process.platform === 'win32'`): sí, powershell.exe local.
 * - WSL2 (`process.platform === 'linux'` + `/proc/version` menciona `microsoft`):
 *   sí, porque el interop de Windows expone `powershell.exe` y éste corre WinRT
 *   contra el Windows anfitrión.
 * - Linux/macOS reales: no.
 * Cacheado: leer /proc/version en cada llamada es caro y la respuesta no cambia.
 */
export function canUseSmtc(): boolean {
  if (_canUseSmtcCache !== null) return _canUseSmtcCache;
  let result = false;
  if (process.platform === 'win32') {
    result = true;
  } else if (process.platform === 'linux') {
    try {
      const version = fs.readFileSync('/proc/version', 'utf8');
      result = /microsoft/i.test(version);
    } catch {
      result = false;
    }
  }
  _canUseSmtcCache = result;
  return result;
}

/** Lee el Now Playing de Windows por SMTC. No-op si no hay interop (Linux/macOS reales). */
export class WindowsNowPlaying {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = '';

  start(onUpdate: (np: NowPlaying | null) => void): void {
    if (!canUseSmtc() || this.proc) return;

    try {
      this.proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_LINES.join('\n')],
        { windowsHide: true, env: { ...process.env } },
      );
    } catch (err) {
      // Sin powershell.exe alcanzable (p. ej. Linux real): cae a AudD en silencio.
      console.error('[nowPlaying] no se pudo lanzar PowerShell:', err);
      this.proc = null;
      return;
    }

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk: string) => {
      this.buf += chunk;
      let nl: number;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (line) this.handleLine(line, onUpdate);
      }
    });

    // 'error' (ENOENT cuando powershell.exe no existe) se emite async: no rompe
    // nada, simplemente SMTC queda fuera de juego y el usuario usa AudD/Mic.
    this.proc.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error('[nowPlaying] PowerShell error:', err);
      }
      this.proc = null;
    });
  }

  private handleLine(line: string, onUpdate: (np: NowPlaying | null) => void): void {
    let raw: RawSmtc;
    try {
      raw = JSON.parse(line) as RawSmtc;
    } catch {
      return;
    }
    if (raw.none || raw.error || !raw.title || !raw.artist || typeof raw.positionMs !== 'number') {
      onUpdate(null);
      return;
    }
    const now = Date.now();
    const lastUpdated = typeof raw.lastUpdatedMs === 'number' && raw.lastUpdatedMs > 0 ? raw.lastUpdatedMs : now;
    // Posición viva = posición reportada + tiempo transcurrido desde su update
    // (solo si está reproduciendo).
    const live = raw.positionMs + (raw.playing ? Math.max(0, now - lastUpdated) : 0);
    onUpdate({
      title: raw.title,
      artist: raw.artist,
      positionMs: Math.max(0, live),
      atEpochMs: now,
      playing: !!raw.playing,
      durationMs: raw.endMs && raw.endMs > 0 ? raw.endMs : undefined,
    });
  }

  stop(): void {
    if (this.proc) {
      this.proc.removeAllListeners();
      this.proc.kill();
      this.proc = null;
    }
    this.buf = '';
  }
}
