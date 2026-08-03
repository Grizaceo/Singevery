// ============================================================================
// SyncClock — reloj de sincronía del widget: posición, offsets, corrección
// de deriva, pausa por silencio y aprendizaje de latencia global.
//
// Extraído de stateStore.ts (modularización god file, 2026-08-03).
// No depende de electron ni de SyncEngine: solo de los stores persistidos.
// ============================================================================

import type { OffsetStore, CalibrationStore } from '../services/settings';
import { rampedCorrection } from './syncTiming';

/** Nivel de audio (0..1) por debajo del cual consideramos silencio.
 *  Alineado con SILENCE_PEAK de capture.ts. */
const SILENCE_LEVEL = 0.012;
/** Silencio sostenido (ms) antes de congelar el reloj (evita pausar por un
 *  bache puntual de nivel). */
const SILENCE_HOLD_MS = 400;

/**
 * Reloj anclado: la posición mostrada = base cruda + tiempo de pared desde el
 * ancla + offset crónico persistido + corrección de deriva en rampa.
 * El reloj se puede congelar (pausa/silencio) y reanudar sin saltos.
 */
export class SyncClock {
  /** Base de posición SIN offset crónico ni corrección: el "crudo" anclado. */
  private positionMs = 0;
  private anchoredAt = Date.now();

  /** Offset de sincronización persistente (ms). Corrige atraso/adelanto crónico
   *  de la estimación de AudD para esta pista. currentPosition() lo suma en
   *  vivo. Positivo = adelanta la letra, negativo = la atrasa. */
  private syncOffsetMs = 0;

  /** Calibración global de latencia (ms, persistida). Compensa el adelanto
   *  sistemático de AudD por el tiempo de grabación+identificación. Se aplica
   *  al anclar cada match (adjustMatchPosition en stateStore). */
  private calibrationOffsetMs = 0;

  /** Corrección suave de deriva en curso: se ramplea de 0 a este target. */
  private correctionTargetMs = 0;
  private correctionStartedAt = Date.now();

  /** Reloj congelado: cuando la música está en pausa/silencio, la posición no
   *  avanza con el reloj de pared (evita que la letra "se escape" en una pausa). */
  private clockPaused = false;
  /** Momento en que empezó el silencio actual (null = hay señal). */
  private silentSince: number | null = null;

  /** Pistas distintas con corrección coherente antes de aprender la latencia. */
  private static readonly LATENCY_LEARN_MIN_TRACKS = 3;
  /** Por debajo de esto no vale la pena mover la calibración global. */
  private static readonly LATENCY_LEARN_MIN_MS = 250;

  private readonly offsetStore: OffsetStore;
  private readonly calibrationStore: CalibrationStore;

  constructor(
    offsetStore: OffsetStore,
    calibrationStore: CalibrationStore,
  ) {
    this.offsetStore = offsetStore;
    this.calibrationStore = calibrationStore;
    this.calibrationOffsetMs = calibrationStore.get();
  }

  // ---------------------------------------------------------------------------
  // Posición mostrada y anclaje
  // ---------------------------------------------------------------------------

  /** Posición mostrada (con offset y corrección) en `at`. Público para tests/UI. */
  getDisplayedPosition(at: number = Date.now()): number {
    return this.currentPosition(at);
  }

  private currentPosition(now: number = Date.now()): number {
    // Reloj congelado (pausa/silencio): no acumulamos tiempo de pared.
    const elapsed = this.clockPaused ? 0 : Math.max(0, now - this.anchoredAt);
    return (
      this.positionMs +
      elapsed +
      this.syncOffsetMs +
      rampedCorrection(this.correctionTargetMs, this.correctionStartedAt, now)
    );
  }

  /**
   * Re-ancla para que la posición MOSTRADA sea `displayedPos` en `at`, y resetea
   * la corrección de deriva. `displayedPos` ya incluye el offset crónico; lo
   * restamos para guardar la base cruda (currentPosition() lo vuelve a sumar).
   * Público: lo usa StateStore al cargar/corregir pistas y al hacer seek.
   */
  reanchor(displayedPos: number, at: number = Date.now()): void {
    this.positionMs = displayedPos - this.syncOffsetMs;
    this.anchoredAt = at;
    this.correctionTargetMs = 0;
    this.correctionStartedAt = at;
  }

  /** Consolida la corrección en curso en la base sin alterar la posición visible. */
  settle(now: number): void {
    if (this.correctionTargetMs === 0) return;
    this.reanchor(this.currentPosition(now), now);
  }

  /**
   * Inicia una corrección de deriva en rampa hacia `targetMs` (consolida lo
   * absorbido hasta ahora). Equivale al patrón "settle + fijar rampa" que
   * usaban los callers de corrección.
   */
  startCorrection(targetMs: number, at: number = Date.now()): void {
    this.settle(at);
    this.correctionTargetMs = targetMs;
    this.correctionStartedAt = at;
  }

  /**
   * Re-ancla la posición actual sumando un delta (ms). Instantáneo: la letra
   * salta y el avance por reloj continúa limpio desde el nuevo punto.
   * Usado por seek (rueda del mouse) y por ajuste fino.
   */
  nudgePosition(deltaMs: number): void {
    const now = Date.now();
    const next = Math.max(0, this.currentPosition(now) + deltaMs);
    this.reanchor(next, now);
  }

  /**
   * Salta al boundary de línea anterior (-1) o siguiente (+1) desde la
   * posición actual. Devuelve false si no hay letras cargadas.
   */
  seekToLine(direction: -1 | 1, lineStarts: number[]): boolean {
    if (lineStarts.length === 0) return false;

    const now = Date.now();
    const cur = this.currentPosition(now);

    let target: number | null = null;
    if (direction === 1) {
      // Siguiente línea cuyo start_ms > posición actual.
      for (const start of lineStarts) {
        if (start > cur) {
          target = start;
          break;
        }
      }
      if (target == null) target = lineStarts[lineStarts.length - 1];
    } else {
      // Línea anterior: el start_ms más grande que sea < (cur - pequeño margen)
      // para no quedarse en la línea actual si estamos justo en su inicio.
      const margin = 300;
      let prev: number | null = null;
      for (const start of lineStarts) {
        if (start < cur - margin) {
          prev = start;
        } else {
          break;
        }
      }
      target = prev ?? lineStarts[0];
    }

    this.reanchor(Math.max(0, target), now);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Pausa / silencio
  // ---------------------------------------------------------------------------

  /** Congela el reloj en la posición mostrada actual. */
  pauseClock(at: number = Date.now()): void {
    if (this.clockPaused) return;
    // Consolida SIEMPRE la posición (incluido el tiempo acumulado) antes de
    // congelar, no solo la corrección en curso.
    this.reanchor(this.currentPosition(at), at);
    this.clockPaused = true;
  }

  /** Reanuda el reloj desde la posición congelada, sin salto. */
  resumeClock(at: number = Date.now()): void {
    if (!this.clockPaused) return;
    this.reanchor(this.currentPosition(at), at);
    this.clockPaused = false;
  }

  isClockPaused(): boolean {
    return this.clockPaused;
  }

  /**
   * Reporta el nivel de audio capturado (0..1). Silencio sostenido congela el
   * reloj; cuando vuelve la señal lo reanuda desde donde quedó. Es la capa de
   * pausa "de fallback" (sin reproductor): SMTC, cuando esté, da la pausa
   * instantánea vía setPlaybackState/setExternalPosition.
   */
  reportAudioLevel(level: number, at: number = Date.now()): void {
    if (level < SILENCE_LEVEL) {
      if (this.silentSince == null) {
        this.silentSince = at;
      } else if (!this.clockPaused && at - this.silentSince >= SILENCE_HOLD_MS) {
        // Congela en el instante en que EMPEZÓ el silencio (no tras el hold),
        // para no arrastrar los ~400ms de deadband en la posición congelada.
        this.pauseClock(this.silentSince);
      }
    } else {
      this.silentSince = null;
      if (this.clockPaused) this.resumeClock(at);
    }
  }

  /** Reinicia pausa/silencio (carga de pista nueva: hay audio sonando). */
  resetPlaybackState(): void {
    this.clockPaused = false;
    this.silentSince = null;
  }

  // ---------------------------------------------------------------------------
  // Offset por pista y calibración global
  // ---------------------------------------------------------------------------

  /** Carga el offset crónico persistido de la pista y cancela la corrección. */
  loadSyncOffset(trackKey: string): void {
    this.syncOffsetMs = this.offsetStore.get(trackKey);
    this.correctionTargetMs = 0;
  }

  /** Fija el offset crónico y lo persiste (StateStore: pista importada). */
  setSyncOffsetAndPersist(ms: number, trackKey: string | null): void {
    this.syncOffsetMs = ms;
    if (trackKey) this.offsetStore.set(trackKey, ms);
  }

  getSyncOffsetMs(): number {
    return this.syncOffsetMs;
  }

  /**
   * Ajusta el offset crónico (ms) y lo persiste para la pista actual.
   * Como currentPosition() suma syncOffsetMs en vivo, el cambio se refleja
   * solo (la posición mostrada salta `deltaMs` en el próximo tick).
   */
  adjustSyncOffset(deltaMs: number, trackKey: string | null): void {
    this.syncOffsetMs += deltaMs;
    if (trackKey) {
      this.offsetStore.set(trackKey, this.syncOffsetMs);
    }
    this.learnGlobalLatency();
  }

  /** Calibración global persistida (ms, latencia AudD). */
  getCalibrationOffsetMs(): number {
    return this.calibrationOffsetMs;
  }

  /**
   * Ajusta la calibración global (ms) y la persiste. Como la calibración se
   * aplica al anclar cada match (va dentro del crudo), el cambio se refleja
   * en vivo desplazando la letra `deltaMs` (igual que el offset por pista) y
   * queda para los próximos matches.
   */
  adjustCalibrationOffset(deltaMs: number): void {
    this.calibrationOffsetMs += deltaMs;
    this.calibrationStore.set(this.calibrationOffsetMs);
    // Reflejar en vivo: desplaza la posición mostrada el delta.
    this.nudgePosition(deltaMs);
  }

  /**
   * Mueve `deltaMs` desde los offsets por pista hacia la calibración global,
   * sin que la letra salte: la calibración solo actúa al anclar matches
   * futuros, así que la posición mostrada se re-ancla en su valor actual.
   */
  private promoteToCalibration(deltaMs: number): void {
    if (!deltaMs) return;
    const now = Date.now();
    const displayed = this.currentPosition(now);

    this.calibrationOffsetMs += deltaMs;
    this.calibrationStore.set(this.calibrationOffsetMs);
    // Descontar de lo ya guardado para no contar el desfase dos veces.
    this.offsetStore.rebase?.(deltaMs);
    this.syncOffsetMs -= deltaMs;
    if (this.currentTrackKeyRef) {
      this.offsetStore.set(this.currentTrackKeyRef, this.syncOffsetMs);
    }
    this.reanchor(displayed, now);
  }

  /**
   * Aplica el ajuste de la pista actual a TODAS las canciones (acción manual
   * del usuario: "esto pasa siempre, no solo aquí"). Devuelve la calibración
   * global resultante.
   */
  applyOffsetToAllTracks(): number {
    this.promoteToCalibration(this.syncOffsetMs);
    return this.calibrationOffsetMs;
  }

  /** Detecta latencia global a partir de las correcciones ya hechas. */
  private learnGlobalLatency(): void {
    const entries = this.offsetStore.entries?.();
    if (!entries) return;
    const values = Object.values(entries).filter((v) => Math.abs(v) >= SyncClock.LATENCY_LEARN_MIN_MS);
    if (values.length < SyncClock.LATENCY_LEARN_MIN_TRACKS) return;
    // Todas en el mismo sentido: si las hay de ambos signos, no es global.
    const positive = values.every((v) => v > 0);
    const negative = values.every((v) => v < 0);
    if (!positive && !negative) return;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    if (Math.abs(median) < SyncClock.LATENCY_LEARN_MIN_MS) return;

    console.log(
      `[sync] latencia global aprendida de ${values.length} pistas: ${median}ms ` +
        `(calibración ${this.calibrationOffsetMs} → ${this.calibrationOffsetMs + median})`,
    );
    this.promoteToCalibration(median);
  }

  /**
   * Referencia al track key actual, inyectada por StateStore (setCurrentTrackKey).
   * El reloj la usa para persistir offsets sin depender de la pista en curso.
   */
  private currentTrackKeyRef: string | null = null;

  setCurrentTrackKey(key: string | null): void {
    this.currentTrackKeyRef = key;
  }
}
