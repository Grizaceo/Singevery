// ============================================================================
// matchLog.ts — bitácora de aciertos del reconocimiento (loop de mejora).
//
// Append-only JSONL en <userData>/logs/matchlog.jsonl. Registra cada
// identificación (fuente, resultado, pista), la carga de letras y el feedback
// explícito del usuario ("se equivocó" / "estaba bien"). Las stats agregadas
// alimentan la sección de Precisión en Opciones y el análisis offline del log.
//
// El loop: los logs de uso se analizan (humano o agente) → se detectan
// canciones/patrones donde el reconocimiento falla → se corrige el pipeline →
// la app se actualiza. El botón "Se equivocó" marca el evento y dispara una
// re-identificación inmediata (recalibración en vivo).
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

export type MatchSource = 'audd' | 'shazam' | 'smtc' | 'manual';
export type MatchOutcome = 'matched' | 'no_match' | 'error' | 'correct' | 'wrong' | 'loaded' | 'no_lyrics';

export interface MatchLogEntry {
  /** ISO timestamp del evento. */
  ts: string;
  type: 'identify' | 'correct' | 'load' | 'feedback';
  source: MatchSource;
  outcome: MatchOutcome;
  track?: { title: string; artist: string };
  /** true si la identificación cambió la canción en pantalla. */
  changed?: boolean;
  /** Milisegundos que tardó la búsqueda (identify/load). */
  durationMs?: number;
  /** Confianza del proveedor (0..1) cuando la reporta. */
  confidence?: number;
  error?: string;
}

export interface MatchStats {
  total: number;
  matched: number;
  noMatch: number;
  errors: number;
  correctFeedback: number;
  wrongFeedback: number;
  /** matched / (matched + noMatch + errors), 0 si no hay eventos. */
  accuracy: number;
  bySource: Partial<Record<MatchSource, { total: number; matched: number }>>;
  lastEntry: MatchLogEntry | null;
}

/** Tamaño máximo del log activo: al superarlo se rota a .1 (se descarta el viejo). */
const MAX_LOG_BYTES = 5 * 1024 * 1024;

export class MatchLog {
  private readonly filePath: string;
  private lastErrorShownAt = 0;

  constructor(logsDir: string) {
    this.filePath = path.join(logsDir, 'matchlog.jsonl');
    fs.mkdirSync(logsDir, { recursive: true });
    this.rotateIfNeeded();
  }

  private rotateIfNeeded(): void {
    try {
      const st = fs.statSync(this.filePath);
      if (st.size > MAX_LOG_BYTES) {
        fs.renameSync(this.filePath, `${this.filePath}.1`);
      }
    } catch {
      // No existe todavía: primera escritura.
    }
  }

  /** Registra un evento en el log. Nunca lanza: el logging no debe romper el flujo. */
  log(entry: Omit<MatchLogEntry, 'ts'>): void {
    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.filePath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
    } catch (err) {
      // Un fallo de disco no debe tumbar la identificación de la canción.
      const now = Date.now();
      if (now - this.lastErrorShownAt > 60_000) {
        console.error('[matchlog] no se pudo escribir el log:', err);
        this.lastErrorShownAt = now;
      }
    }
  }

  /** Lee el log completo (activo + rotado) para agregar stats. */
  private readAll(): MatchLogEntry[] {
    const entries: MatchLogEntry[] = [];
    for (const file of [`${this.filePath}.1`, this.filePath]) {
      try {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            entries.push(JSON.parse(line) as MatchLogEntry);
          } catch {
            // Línea corrupta (corte a mitad): se salta, el resto del log vale.
          }
        }
      } catch {
        // Archivo ausente: normal en la primera ejecución.
      }
    }
    return entries;
  }

  /**
   * Últimos N eventos, del más nuevo al más viejo. Para el endpoint de
   * diagnóstico: sin esto, "por qué no reconoció" solo se puede responder
   * abriendo el JSONL a mano en la máquina del usuario.
   */
  recent(limit = 20): MatchLogEntry[] {
    if (limit <= 0) return [];
    const entries: MatchLogEntry[] = [];
    try {
      const lines = fs.readFileSync(this.filePath, 'utf8').split('\n');
      // Recorrido desde el final: el log puede pesar megas y solo interesa la cola.
      for (let i = lines.length - 1; i >= 0 && entries.length < limit; i -= 1) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          entries.push(JSON.parse(line) as MatchLogEntry);
        } catch {
          // Línea corrupta (escritura cortada): se salta.
        }
      }
    } catch {
      // Sin log todavía.
    }
    return entries;
  }

  /** Agrega el log en métricas compactas para la UI de Opciones. */
  getStats(): MatchStats {
    const entries = this.readAll();
    const bySource: MatchStats['bySource'] = {};
    let matched = 0;
    let noMatch = 0;
    let errors = 0;
    let correctFeedback = 0;
    let wrongFeedback = 0;

    for (const e of entries) {
      if (e.type === 'identify' || e.type === 'correct') {
        if (e.outcome === 'matched') matched += 1;
        else if (e.outcome === 'no_match') noMatch += 1;
        else if (e.outcome === 'error') errors += 1;
        const src = bySource[e.source] ?? { total: 0, matched: 0 };
        src.total += 1;
        if (e.outcome === 'matched') src.matched += 1;
        bySource[e.source] = src;
      } else if (e.type === 'feedback') {
        if (e.outcome === 'correct') correctFeedback += 1;
        else if (e.outcome === 'wrong') wrongFeedback += 1;
      }
    }

    const decided = matched + noMatch + errors;
    return {
      total: entries.length,
      matched,
      noMatch,
      errors,
      correctFeedback,
      wrongFeedback,
      accuracy: decided > 0 ? matched / decided : 0,
      bySource,
      lastEntry: entries.length > 0 ? entries[entries.length - 1] : null,
    };
  }
}
