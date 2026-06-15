// ============================================================================
// SyncEngine — porte fiel de libs/sync/engine.py a TypeScript.
//
// Mantiene la misma lógica: dado un position_ms, encuentra la línea actual y
// devuelve un RenderModel con una ventana de `windowSize` líneas antes/después.
// ============================================================================

import type { RenderModel, Status, TimedLyrics } from '../../src/types';

export interface RenderConfig {
  /** Número de líneas de contexto antes y después de la línea actual. */
  windowSize: number;
  mirrorMode: boolean;
}

const NO_LYRICS_MODEL: RenderModel = {
  previous_lines: [],
  current_line: '',
  next_lines: [],
  status: 'NO_LYRICS',
  font_scale: 1.0,
  opacity: 1.0,
  alignment: 'center',
  mirror_mode: false,
};

export class SyncEngine {
  private currentLyrics: TimedLyrics | null = null;
  public offsetMs = 0;
  public renderConfig: RenderConfig = {
    windowSize: 2,
    mirrorMode: false,
  };

  setLyrics(lyrics: TimedLyrics | null): void {
    this.currentLyrics = lyrics;
  }

  getLyrics(): TimedLyrics | null {
    return this.currentLyrics;
  }

  /**
   * Update offset based on recognition match.
   * En la versión Python es un no-op; el cálculo de posición lo hace el
   * StateStore a partir del match. Se conserva por paridad con la API original.
   */
  updateMatch(_positionMs: number, _matchedAt: number): void {
    // Intencionalmente vacío — paridad con libs/sync/engine.py.
  }

  getRenderModel(positionMs: number, status: Status = 'DISPLAYING'): RenderModel {
    const lyrics = this.currentLyrics;
    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
      return { ...NO_LYRICS_MODEL, mirror_mode: this.renderConfig.mirrorMode };
    }

    const lines = lyrics.lines;

    // 1. Encontrar la línea actual (búsqueda lineal — igual que el Python).
    let currentIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const start = line.start_ms;
      // end_ms explícito, o hasta el inicio de la siguiente, o "infinito".
      let end: number;
      if (line.end_ms != null) {
        end = line.end_ms;
      } else if (i + 1 < lines.length) {
        end = lines[i + 1].start_ms;
      } else {
        end = Number.MAX_SAFE_INTEGER;
      }

      if (start <= positionMs && positionMs < end) {
        currentIndex = i;
        break;
      }
    }

    // 2. Si no cae en ninguna línea:
    if (currentIndex === -1) {
      if (positionMs < lines[0].start_ms) {
        // Intro instrumental: mostrar "..." con la próxima línea.
        return {
          previous_lines: [],
          current_line: '...',
          next_lines: [lines[0].text],
          font_scale: 1.0,
          opacity: 1.0,
          alignment: 'center',
          mirror_mode: this.renderConfig.mirrorMode,
          status: 'IDLE',
        };
      }
      // Pasamos del final: anclar a la última línea.
      currentIndex = lines.length - 1;
    }

    // 3. Extraer la ventana.
    const windowSize = this.renderConfig.windowSize;
    const startPrev = Math.max(0, currentIndex - windowSize);
    const endNext = Math.min(lines.length, currentIndex + 1 + windowSize);

    const previousLines: string[] = [];
    for (let i = startPrev; i < currentIndex; i++) {
      previousLines.push(lines[i].text);
    }
    const currentText = lines[currentIndex].text;
    const nextLines: string[] = [];
    for (let i = currentIndex + 1; i < endNext; i++) {
      nextLines.push(lines[i].text);
    }

    return {
      previous_lines: previousLines,
      current_line: currentText,
      next_lines: nextLines,
      font_scale: 1.0,
      opacity: 1.0,
      alignment: 'center',
      mirror_mode: this.renderConfig.mirrorMode,
      status,
    };
  }
}
