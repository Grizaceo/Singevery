// ============================================================================
// SyncEngine — porte fiel de libs/sync/engine.py a TypeScript.
//
// Mantiene la misma lógica: dado un position_ms, encuentra la línea actual y
// devuelve un RenderModel con una ventana de `windowSize` líneas antes/después.
// ============================================================================

import type { LyricLine, RenderLine, RenderModel, Status, TimedLyrics } from '../../src/types';

export interface RenderConfig {
  /** Número de líneas de contexto antes y después de la línea actual. */
  windowSize: number;
  mirrorMode: boolean;
}

/** Convierte una línea de letra en línea de render (original + lecturas + words). */
function toRenderLine(line: LyricLine): RenderLine {
  return { text: line.text, furigana: line.furigana, romaji: line.romaji, words: line.words };
}

const NO_LYRICS_MODEL: RenderModel = {
  previous_lines: [],
  current_line: { text: '' },
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
          current_line: { text: '...' },
          next_lines: [toRenderLine(lines[0])],
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

    const previousLines: RenderLine[] = [];
    for (let i = startPrev; i < currentIndex; i++) {
      previousLines.push(toRenderLine(lines[i]));
    }
    const currentLine = toRenderLine(lines[currentIndex]);
    const nextLines: RenderLine[] = [];
    for (let i = currentIndex + 1; i < endNext; i++) {
      nextLines.push(toRenderLine(lines[i]));
    }

    // Avance interpolado dentro de la línea actual (solo con letra sincronizada).
    let currentProgress: number | undefined;
    if (lyrics.synced) {
      const cur = lines[currentIndex];
      let end: number;
      if (cur.end_ms != null) end = cur.end_ms;
      else if (currentIndex + 1 < lines.length) end = lines[currentIndex + 1].start_ms;
      else end = NaN;
      if (Number.isFinite(end) && end > cur.start_ms) {
        currentProgress = Math.max(0, Math.min(1, (positionMs - cur.start_ms) / (end - cur.start_ms)));
      }
    }

    // Karaoke por palabra REAL (Enhanced LRC): índice de la última palabra de
    // la línea actual cuyo start_ms <= posición. Precisión exacta por timing,
    // sin interpolar. Si no hay `words`, el renderer cae a la interpolación.
    let currentWordIndex: number | undefined;
    const curWords = lines[currentIndex].words;
    if (curWords && curWords.length > 0) {
      let idx = -1;
      for (let w = 0; w < curWords.length; w++) {
        if (curWords[w].start_ms <= positionMs) idx = w;
        else break;
      }
      // idx = -1 si todavía no arrancó ninguna palabra (estamos antes de la 1ª).
      currentWordIndex = idx;
    }

    return {
      previous_lines: previousLines,
      current_line: currentLine,
      next_lines: nextLines,
      current_progress: currentProgress,
      current_word_index: currentWordIndex,
      font_scale: 1.0,
      opacity: 1.0,
      alignment: 'center',
      mirror_mode: this.renderConfig.mirrorMode,
      status,
    };
  }
}
