// ============================================================================
// SyncEngine — porte fiel de libs/sync/engine.py a TypeScript.
//
// Mantiene la misma lógica: dado un position_ms, encuentra la línea actual y
// devuelve un RenderModel con una ventana de `windowSize` líneas antes/después.
// ============================================================================

import type { LyricLine, RenderLine, RenderModel, Status, TimedLyrics } from '../../src/types';
import { computeLineProgress } from './syncTiming';

export interface RenderConfig {
  /** Número de líneas de contexto antes y después de la línea actual. */
  windowSize: number;
  mirrorMode: boolean;
  fontScale: number;
  opacity: number;
  alignment: 'left' | 'center' | 'right';
}

/** Convierte una línea de letra en línea de render (original + lecturas). */
function toRenderLine(line: LyricLine): RenderLine {
  const out: RenderLine = {
    text: line.text,
  };
  // Solo propiedades presentes: los tests y consumidores dependen de que las
  // claves undefined no aparezcan en el objeto serializado.
  if (line.furigana) out.furigana = line.furigana;
  if (line.romaji) out.romaji = line.romaji;
  if (line.kana) out.kana = line.kana;
  if (line.ipa) out.ipa = line.ipa;
  if (line.furiganaIpa) out.furiganaIpa = line.furiganaIpa;
  if (line.translation) out.translation = line.translation;
  if (line.words) out.words = line.words;
  if (line.start_ms != null) out.start_ms = line.start_ms;
  if (line.end_ms != null) out.end_ms = line.end_ms;
  return out;
}

// ============================================================================
// Anticipación adaptativa (secciones densas / rap)
//
// Con sync por línea, en partes rápidas (ej. el verso de JID en "Enemy") la
// línea "actual" llega tarde para leerla: el ojo necesita la que viene. El
// motor mide la densidad local (gap entre inicios de líneas vecinas) y
// adelanta el reloj efectivo del highlight hasta FAST_MAX_LEAD_MS en las
// partes densas, con tope de FAST_LEAD_GAP_FRACTION del gap para nunca
// saltarse una línea completa. El lead se suaviza contra la POSICIÓN (no el
// reloj de pared, para que sea determinista): parte en 0 al cargar letra o
// tras un seek y se acerca al objetivo a LEAD_SLEW_PER_MS por ms reproducido.
// ============================================================================

/** Gap (ms) desde el cual una sección se considera lenta: lead 0. */
const FAST_SLOW_GAP_MS = 3000;
/** Gap (ms) en el que el lead llega a su máximo. */
const FAST_MIN_GAP_MS = 1000;
/** Anticipación máxima del highlight (ms). */
const FAST_MAX_LEAD_MS = 600;
/** El lead nunca supera esta fracción del gap local (no saltarse líneas). */
const FAST_LEAD_GAP_FRACTION = 0.45;
/** Gaps mayores (silencios/instrumentales) no cuentan para la densidad. */
const FAST_SECTION_BREAK_MS = 8000;
/** Con lead suavizado sobre este umbral se reporta fast_pace al renderer. */
const FAST_FLAG_LEAD_MS = 200;
/** Máximo cambio del lead por ms de posición reproducida. */
const LEAD_SLEW_PER_MS = 0.5;
/** Salto de posición mayor a esto (o retroceso) = seek: el lead se resetea. */
const SEEK_JUMP_MS = 2000;

/** Índice de la línea activa en `positionMs`, o -1 si no cae en ninguna. */
function findLineIndex(lines: LyricLine[], positionMs: number): number {
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].start_ms;
    let end: number;
    if (lines[i].end_ms != null) {
      end = lines[i].end_ms as number;
    } else if (i + 1 < lines.length) {
      end = lines[i + 1].start_ms;
    } else {
      end = Number.MAX_SAFE_INTEGER;
    }
    if (start <= positionMs && positionMs < end) return i;
  }
  return -1;
}

/**
 * Mediana del gap entre inicios de líneas alrededor de `index` (desde la
 * anterior hasta ~3 más adelante: lo que viene pesa más que lo que pasó).
 * null = sin datos útiles (bordes o puros silencios) → tratar como lento.
 */
export function computeLocalGapMs(lines: LyricLine[], index: number): number | null {
  const gaps: number[] = [];
  const from = Math.max(0, index - 1);
  const to = Math.min(lines.length - 2, index + 2);
  for (let i = from; i <= to; i++) {
    const gap = lines[i + 1].start_ms - lines[i].start_ms;
    if (gap > 0 && gap < FAST_SECTION_BREAK_MS) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/** Lead objetivo (ms) para un gap local dado. */
export function targetLeadMs(gapMs: number | null): number {
  if (gapMs == null || gapMs >= FAST_SLOW_GAP_MS) return 0;
  const norm = Math.min(1, (FAST_SLOW_GAP_MS - gapMs) / (FAST_SLOW_GAP_MS - FAST_MIN_GAP_MS));
  return Math.min(FAST_MAX_LEAD_MS * norm, FAST_LEAD_GAP_FRACTION * gapMs);
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
  text_color: '#ffffff',
  text_vignette_light: false,
};

export class SyncEngine {
  private currentLyrics: TimedLyrics | null = null;
  /** Lead suavizado actual de la anticipación adaptativa (ms). */
  private smoothedLeadMs = 0;
  /** Última posición vista, para derivar el avance reproducido (suavizado). */
  private lastPositionMs: number | null = null;
  public offsetMs = 0;
  public renderConfig: RenderConfig = {
    windowSize: 2,
    mirrorMode: false,
    fontScale: 1.0,
    opacity: 1.0,
    alignment: 'center',
  };

  setLyrics(lyrics: TimedLyrics | null): void {
    this.currentLyrics = lyrics;
    this.smoothedLeadMs = 0;
    this.lastPositionMs = null;
  }

  getLyrics(): TimedLyrics | null {
    return this.currentLyrics;
  }

  getRenderModel(positionMs: number, status: Status = 'DISPLAYING'): RenderModel {
    const lyrics = this.currentLyrics;
    if (!lyrics || !lyrics.lines || lyrics.lines.length === 0) {
      return {
        ...NO_LYRICS_MODEL,
        mirror_mode: this.renderConfig.mirrorMode,
        font_scale: this.renderConfig.fontScale,
        opacity: this.renderConfig.opacity,
        alignment: this.renderConfig.alignment,
      };
    }

    const lines = lyrics.lines;

    // 0. Anticipación adaptativa: avance reproducido desde el último tick
    //    (negativo o gigante = seek → resetear el lead y re-calentar).
    const elapsedMs =
      this.lastPositionMs == null ? null : positionMs - this.lastPositionMs;
    this.lastPositionMs = positionMs;
    if (elapsedMs == null || elapsedMs < 0 || elapsedMs > SEEK_JUMP_MS) {
      this.smoothedLeadMs = 0;
    }

    // 1. Línea bajo la posición REAL (base para medir densidad local).
    const rawIndex = findLineIndex(lines, positionMs);
    const paceIndex =
      rawIndex !== -1 ? rawIndex : positionMs < lines[0].start_ms ? 0 : lines.length - 1;
    const target = targetLeadMs(computeLocalGapMs(lines, paceIndex));
    if (elapsedMs != null && elapsedMs >= 0 && elapsedMs <= SEEK_JUMP_MS) {
      const maxStep = LEAD_SLEW_PER_MS * elapsedMs;
      const delta = target - this.smoothedLeadMs;
      this.smoothedLeadMs += Math.max(-maxStep, Math.min(maxStep, delta));
    }
    const effectiveMs = positionMs + Math.round(this.smoothedLeadMs);
    const fastPace = this.smoothedLeadMs >= FAST_FLAG_LEAD_MS;

    // 2. Línea actual con el reloj efectivo (adelantado en secciones densas).
    let currentIndex = findLineIndex(lines, effectiveMs);

    // 3. Si no cae en ninguna línea:
    if (currentIndex === -1) {
      if (effectiveMs < lines[0].start_ms) {
        // Intro instrumental: mostrar "..." con la próxima línea.
        return {
          previous_lines: [],
          current_line: { text: '...' },
          next_lines: [toRenderLine(lines[0])],
          font_scale: this.renderConfig.fontScale,
          opacity: this.renderConfig.opacity,
          alignment: this.renderConfig.alignment,
          mirror_mode: this.renderConfig.mirrorMode,
          text_color: '#ffffff',
          text_vignette_light: false,
          status: 'IDLE',
        };
      }
      // Pasamos del final: anclar a la última línea.
      currentIndex = lines.length - 1;
    }

    // 4. Extraer la ventana.
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

    // Progreso interpolado dentro de la línea actual (resaltado por tiempo).
    // Usa el reloj efectivo para que highlight y anticipación sean coherentes.
    // Si la línea no tiene end_ms, se estima con el inicio de la siguiente.
    const nextStartMs =
      currentIndex + 1 < lines.length ? lines[currentIndex + 1].start_ms : undefined;
    const progress = computeLineProgress(lines[currentIndex], effectiveMs, nextStartMs);

    // Modo palabra (A2): si la línea tiene words, calcula la palabra activa y
    // su avance. Reutiliza computeLineProgress por palabra (el fin de cada
    // palabra es el inicio de la siguiente, o el fin de la línea).
    let wordIndex = -1;
    let wordProgress = 0;
    const words = lines[currentIndex].words;
    if (words && words.length > 0) {
      for (let i = 0; i < words.length; i++) {
        if (words[i].start_ms <= effectiveMs) wordIndex = i;
        else break;
      }
      if (wordIndex >= 0) {
        // Fin de la palabra: inicio de la siguiente, o el fin de la línea
        // (end_ms o inicio de la línea siguiente) si es la última.
        const lineEndMs = lines[currentIndex].end_ms ?? nextStartMs;
        const nextWordStart =
          wordIndex + 1 < words.length ? words[wordIndex + 1].start_ms : lineEndMs;
        wordProgress = computeLineProgress(words[wordIndex], effectiveMs, nextWordStart);
      }
    }

    return {
      previous_lines: previousLines,
      current_line: currentLine,
      next_lines: nextLines,
      font_scale: this.renderConfig.fontScale,
      opacity: this.renderConfig.opacity,
      alignment: this.renderConfig.alignment,
      mirror_mode: this.renderConfig.mirrorMode,
      text_color: '#ffffff',
      text_vignette_light: false,
      status,
      current_line_progress: progress,
      current_word_index: wordIndex >= 0 ? wordIndex : undefined,
      current_word_progress: wordProgress > 0 ? wordProgress : undefined,
      fast_pace: fastPace || undefined,
    };
  }
}
