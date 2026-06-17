// ============================================================================
// lyricsSource.ts — abstracción de fuente de letras + orquestador de cadena.
//
// Cada fuente (lrclib, AudD findLyrics, lyrics.ovh, Genius) implementa
// `LyricSource`. El orquestador `fetchLyricsChain` las prueba en orden y
// devuelve la primera que encuentra letra. Orden prioriza calidad: synced
// (lrclib, karaoke por palabra) antes que plain (repartido por duración).
// ============================================================================

import { parseLrc, plainTextToLyrics } from './lrcParser';
import { lrclibSource } from './lrclib';
import { auddLyricsSource } from './auddLyrics';
import { lyricsOvhSource } from './lyricsOvh';
import { geniusLyricsSource } from './geniusLyrics';
import type { TimedLyrics } from '../../src/types';

export interface LyricSourceResult {
  /** Texto crudo: LRC con timestamps (synced) o letra plana (synced=false). */
  lyrics: string;
  /** true si el texto es LRC sincronizado; false si es plain (sin timestamps). */
  synced: boolean;
  /** Duración de la pista en ms si la fuente la conoce (para repartir plain). */
  durationMs?: number;
  /** Nombre de la fuente ('lrclib' | 'audd' | 'lyrics.ovh' | 'genius'). */
  source: string;
}

export interface LyricSource {
  name: string;
  /**
   * Busca la letra de una pista. Devuelve null si no la encuentra (la cadena
   * probará la siguiente fuente). No lanza: errores de red se tragan como
   * null para que la cadena siga.
   */
  fetch(title: string, artist: string, durationMs?: number): Promise<LyricSourceResult | null>;
}

/**
 * Cadena por defecto en orden de calidad: lrclib (synced) → AudD findLyrics
 * (plain) → lyrics.ovh (plain, API limpia) → Genius (plain, scrape).
 */
export const DEFAULT_LYRICS_SOURCES: LyricSource[] = [
  lrclibSource,
  auddLyricsSource,
  lyricsOvhSource,
  geniusLyricsSource,
];

/**
 * Orquesta la cadena: prueba cada fuente en orden y devuelve el primer
 * resultado non-null. Si ninguna tiene letra, devuelve null (→ NO_LYRICS).
 * Corta en la primera que responde, no prueba las siguientes.
 */
export async function fetchLyricsChain(
  sources: LyricSource[],
  title: string,
  artist: string,
  durationMs?: number,
  debug = false,
): Promise<LyricSourceResult | null> {
  for (const src of sources) {
    try {
      const result = await src.fetch(title, artist, durationMs);
      if (result && result.lyrics && result.lyrics.trim().length > 0) {
        if (debug) console.log(`[lyricsChain] fuente respondió: ${src.name}`);
        return result;
      }
      if (debug) console.log(`[lyricsChain] ${src.name}: sin letra`);
    } catch (err) {
      // Una fuente falla (red, parseo) → la cadena sigue con la siguiente.
      if (debug) console.log(`[lyricsChain] ${src.name} error:`, err);
    }
  }
  return null;
}

/**
 * Convierte el resultado crudo de la cadena en TimedLyrics listo para el
 * SyncEngine. synced → parseLrc (karaoke por palabra si A2). plain → reparte
 * por la duración (de la fuente o pasada por parámetro; la de SMTC/AudD gana).
 */
export function chainResultToTimedLyrics(
  result: LyricSourceResult,
  fallbackDurationMs?: number,
): TimedLyrics | null {
  const durationMs = result.durationMs ?? fallbackDurationMs;
  if (result.synced) {
    const lines = parseLrc(result.lyrics);
    if (lines.length === 0) return null;
    return { lines, source: result.source, synced: true };
  }
  const lines = plainTextToLyrics(result.lyrics, durationMs);
  if (lines.length === 0) return null;
  return { lines, source: result.source, synced: false };
}