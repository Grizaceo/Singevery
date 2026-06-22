// ============================================================================
// StateStore — mantiene el estado canónico del widget y emite el RenderModel
// al renderer por IPC a ~10 Hz.
// ============================================================================

import { BrowserWindow } from 'electron';
import { SyncEngine } from './syncEngine';
import {
  adjustMatchPosition,
  projectAnchoredPosition,
  computeDrift,
  rampedCorrection,
  normalizeTrackKey,
} from './syncTiming';
import type { RecognitionPhase } from './syncTiming';
import { LyricsService, defaultLyricsService } from '../services/lyrics/lyricsService';
import { NULL_OFFSET_STORE, NULL_CALIBRATION_STORE } from '../services/settings';
import type { OffsetStore, CalibrationStore } from '../services/settings';
import type { RenderModel, Status, TimedLyrics, TrackMatch } from '../../src/types';

export type { RecognitionPhase };

const IDLE_MESSAGE = 'Esperando música...';

/** Nivel de audio (0..1) por debajo del cual consideramos silencio.
 *  Alineado con SILENCE_PEAK de capture.ts. */
const SILENCE_LEVEL = 0.012;
/** Silencio sostenido (ms) antes de congelar el reloj (evita pausar por un
 *  bache puntual de nivel). */
const SILENCE_HOLD_MS = 400;

export class StateStore {
  private engine: SyncEngine;
  private window: BrowserWindow | null;
  private intervalHandle: NodeJS.Timeout | null = null;

  private trackTitle: string | undefined;
  private trackArtist: string | undefined;

  private overrideStatus: Status | null = null;
  private lastMatchKey: string | null = null;
  private currentTrackKey: string | null = null;

  /** Base de posición SIN offset crónico ni corrección: el "crudo" anclado. */
  private positionMs = 0;
  private anchoredAt = Date.now();

  /** Offset de sincronización persistente (ms). Corrige atraso/adelanto crónico
   *  de la estimación de AudD para esta pista. currentPosition() lo suma en
   *  vivo. Positivo = adelanta la letra, negativo = la atrasa. */
  private syncOffsetMs = 0;

  /** Calibración global de latencia (ms, persistida). Compensa el adelanto
   *  sistemático de AudD por el tiempo de grabación+identificación. Se aplica
   *  al anclar cada match (adjustMatchPosition). */
  private calibrationOffsetMs = 0;

  /** Corrección suave de deriva en curso: se ramplea de 0 a este target. */
  private correctionTargetMs = 0;
  private correctionStartedAt = Date.now();

  /** Reloj congelado: cuando la música está en pausa/silencio, la posición no
   *  avanza con el reloj de pared (evita que la letra "se escape" en una pausa). */
  private clockPaused = false;
  /** Momento en que empezó el silencio actual (null = hay señal). */
  private silentSince: number | null = null;

  private readonly offsetStore: OffsetStore;
  private readonly calibrationStore: CalibrationStore;
  private readonly lyricsService: LyricsService;

  constructor(
    window: BrowserWindow | null,
    offsetStore: OffsetStore = NULL_OFFSET_STORE,
    lyricsService: LyricsService = defaultLyricsService,
    calibrationStore: CalibrationStore = NULL_CALIBRATION_STORE,
  ) {
    this.window = window;
    this.engine = new SyncEngine();
    this.offsetStore = offsetStore;
    this.lyricsService = lyricsService;
    this.calibrationStore = calibrationStore;
    this.calibrationOffsetMs = calibrationStore.get();
  }

  attachWindow(window: BrowserWindow): void {
    this.window = window;
  }

  start(intervalMs = 100): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  setLyrics(lyrics: TimedLyrics | null, title?: string, artist?: string): void {
    this.engine.setLyrics(lyrics);
    this.trackTitle = title;
    this.trackArtist = artist;
  }

  /**
   * Re-ancla para que la posición MOSTRADA sea `displayedPos` en `at`, y resetea
   * la corrección de deriva. `displayedPos` ya incluye el offset crónico; lo
   * restamos para guardar la base cruda (currentPosition() lo vuelve a sumar).
   */
  private reanchor(displayedPos: number, at: number = Date.now()): void {
    this.positionMs = displayedPos - this.syncOffsetMs;
    this.anchoredAt = at;
    this.correctionTargetMs = 0;
    this.correctionStartedAt = at;
  }

  /** Consolida la corrección en curso en la base sin alterar la posición visible. */
  private settle(now: number): void {
    if (this.correctionTargetMs === 0) return;
    this.reanchor(this.currentPosition(now), now);
  }

  async loadLyricsByMetadata(
    title: string,
    artist: string,
    anchorMs = 0,
    anchorAt = Date.now(),
    album: string | null = null,
    durationMs: number | null = null,
  ): Promise<void> {
    const trackKey = normalizeTrackKey(artist, title);
    this.currentTrackKey = trackKey;
    this.lastMatchKey = trackKey;
    this.syncOffsetMs = this.offsetStore.get(trackKey); // offset crónico persistido
    this.correctionTargetMs = 0;
    // Cargar una pista nueva implica que hay audio sonando: salir de pausa.
    this.clockPaused = false;
    this.silentSince = null;
    this.overrideStatus = 'FETCHING_LYRICS';
    this.trackTitle = title;
    this.trackArtist = artist;

    try {
      // El servicio busca (cache-first), parsea y romaniza; devuelve TimedLyrics.
      const lyrics = await this.lyricsService.getLyrics({ title, artist, album, durationMs });
      if (!lyrics) {
        this.setLyrics(null, title, artist);
        this.overrideStatus = 'NO_LYRICS';
        return;
      }

      // El crudo anclado se proyecta a "ahora" (el fetch tardó); la posición
      // mostrada = crudo + offset crónico.
      const projected = projectAnchoredPosition(anchorMs, anchorAt);

      this.overrideStatus = null;
      this.setLyrics(lyrics, title, artist);
      this.reanchor(projected.positionMs + this.syncOffsetMs, projected.anchorAt);
    } catch (err) {
      this.setLyrics(null, title, artist);
      this.overrideStatus = 'ERROR';
      throw err;
    }
  }

  setRecognitionPhase(phase: RecognitionPhase): void {
    if (phase) {
      this.overrideStatus = phase;
    } else if (
      this.overrideStatus === 'LISTENING' ||
      this.overrideStatus === 'IDENTIFYING'
    ) {
      this.overrideStatus = null;
    }
  }

  /**
   * Aplica un match de reconocimiento.
   * - Misma canción ya cargada → corrige la deriva de forma suave (no recarga).
   * - Canción distinta → recarga la letra y re-ancla.
   *
   * Devuelve `true` si cambió la canción (se recargó letra), `false` si solo
   * fue una corrección de la pista actual.
   */
  async applyMatch(match: TrackMatch, recordStartedAt?: number): Promise<boolean> {
    const { title, artist } = match.track;
    const matchKey = normalizeTrackKey(artist, title);

    const anchor =
      recordStartedAt != null
        ? adjustMatchPosition(match, recordStartedAt, this.calibrationOffsetMs)
        : { positionMs: match.position_ms, anchorAt: match.matched_at };

    if (this.lastMatchKey === matchKey && this.engine.getLyrics()) {
      // Misma canción: reconciliar deriva sin recargar ni tapar la letra.
      this.applyCorrection(anchor);
      if (this.overrideStatus === 'LISTENING' || this.overrideStatus === 'IDENTIFYING') {
        this.overrideStatus = null;
      }
      return false;
    }

    await this.loadLyricsByMetadata(title, artist, anchor.positionMs, anchor.anchorAt);
    return true;
  }

  /**
   * Reconcilia la posición estimada por un match con la mostrada ahora.
   * Suave por defecto (rampa de una fracción del error); salto duro si el error
   * es enorme (seek/cambio brusco); se ignora si es minúsculo (anti-jitter).
   */
  private applyCorrection(anchor: { positionMs: number; anchorAt: number }): void {
    const now = Date.now();
    // Estimación real "ahora" según el match = crudo proyectado + offset crónico.
    const estimatedNow =
      anchor.positionMs + Math.max(0, now - anchor.anchorAt) + this.syncOffsetMs;
    const decision = computeDrift(estimatedNow, this.currentPosition(now));

    if (decision.action === 'ignore') return;
    if (decision.action === 'snap') {
      this.reanchor(estimatedNow, now);
      return;
    }
    // 'correct': consolidar lo absorbido hasta ahora y rampear el resto.
    this.settle(now);
    this.correctionTargetMs = decision.correctionMs;
    this.correctionStartedAt = now;
  }

  clearRecognition(): void {
    if (
      this.overrideStatus === 'LISTENING' ||
      this.overrideStatus === 'IDENTIFYING'
    ) {
      this.overrideStatus = null;
    }
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

  /** Posición mostrada (con offset y corrección) en `at`. Público para tests/UI. */
  getDisplayedPosition(at: number = Date.now()): number {
    return this.currentPosition(at);
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
  seekToLine(direction: -1 | 1): boolean {
    const lyrics = this.engine.getLyrics();
    if (!lyrics || lyrics.lines.length === 0) return false;

    const lines = lyrics.lines;
    const now = Date.now();
    const cur = this.currentPosition(now);

    let target: number | null = null;
    if (direction === 1) {
      // Siguiente línea cuyo start_ms > posición actual.
      for (const line of lines) {
        if (line.start_ms > cur) {
          target = line.start_ms;
          break;
        }
      }
      if (target == null) target = lines[lines.length - 1].start_ms;
    } else {
      // Línea anterior: el start_ms más grande que sea < (cur - pequeño margen)
      // para no quedarse en la línea actual si estamos justo en su inicio.
      const margin = 300;
      let prev: number | null = null;
      for (const line of lines) {
        if (line.start_ms < cur - margin) {
          prev = line.start_ms;
        } else {
          break;
        }
      }
      target = prev ?? lines[0].start_ms;
    }

    this.reanchor(Math.max(0, target), now);
    return true;
  }

  /**
   * Ajusta el offset crónico (ms) y lo persiste para la pista actual.
   * Como currentPosition() suma syncOffsetMs en vivo, el cambio se refleja
   * solo (la posición mostrada salta `deltaMs` en el próximo tick).
   */
  adjustSyncOffset(deltaMs: number): void {
    this.syncOffsetMs += deltaMs;
    if (this.currentTrackKey) {
      this.offsetStore.set(this.currentTrackKey, this.syncOffsetMs);
    }
  }

  getSyncOffsetMs(): number {
    return this.syncOffsetMs;
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

  // ==========================================================================
  // Fuente externa de posición (SMTC / reproductor del SO) — Capa b.
  //
  // El SO es la fuente de verdad del playhead: pausa/seek/skip instantáneos y
  // sin deriva. Estos métodos los llama el lector de SMTC en el proceso main.
  // AudD queda como fallback cuando no hay reproductor accesible.
  // ==========================================================================

  /** Pausa/reanuda el reloj según el estado de reproducción del SO. */
  setPlaybackState(playing: boolean, at: number = Date.now()): void {
    if (playing) this.resumeClock(at);
    else this.pauseClock(at);
  }

  /**
   * Posición de alta confianza del reproductor (SMTC): `positionMs` es el
   * playhead real en `at`. Si no suena, congela. Si suena, reconcilia: ignora
   * diferencias mínimas (anti-jitter) y, por ser fuente de verdad, ancla firme
   * cuando el error supera la banda muerta (cubre el seek).
   */
  applyExternalPosition(positionMs: number, playing: boolean, at: number = Date.now()): void {
    if (!playing) {
      this.pauseClock(at);
      return;
    }
    if (this.clockPaused) this.resumeClock(at);
    const target = Math.max(0, positionMs) + this.syncOffsetMs;
    const decision = computeDrift(target, this.currentPosition(at));
    if (decision.action === 'ignore') return;
    this.reanchor(target, at);
  }

  /**
   * Pista actual reportada por el SO. Si cambió, carga su letra (cache-first);
   * si es la misma, solo reconcilia la posición. Devuelve true si cambió.
   */
  async applyExternalTrack(
    title: string,
    artist: string,
    options: {
      album?: string | null;
      durationMs?: number | null;
      positionMs?: number;
      at?: number;
    } = {},
  ): Promise<boolean> {
    const { album = null, durationMs = null, positionMs = 0, at = Date.now() } = options;
    const key = normalizeTrackKey(artist, title);
    if (this.lastMatchKey === key && this.engine.getLyrics()) {
      this.applyExternalPosition(positionMs, true, at);
      return false;
    }
    await this.loadLyricsByMetadata(title, artist, positionMs, at, album, durationMs);
    return true;
  }

  private overrideMessage(status: Status): string {
    switch (status) {
      case 'LISTENING':
        return 'Escuchando...';
      case 'IDENTIFYING':
        return 'Identificando...';
      case 'FETCHING_LYRICS':
        return 'Buscando letra...';
      case 'NO_LYRICS':
        return 'Sin letra disponible';
      case 'ERROR':
        return 'Error al buscar letra';
      default:
        return IDLE_MESSAGE;
    }
  }

  private buildBaseModel(status: Status, currentLine: string): RenderModel {
    return {
      previous_lines: [],
      current_line: { text: currentLine },
      next_lines: [],
      font_scale: 1.0,
      opacity: 1.0,
      alignment: 'center',
      mirror_mode: this.engine.renderConfig.mirrorMode,
      track_title: this.trackTitle,
      track_artist: this.trackArtist,
      status,
    };
  }

  private tick(): void {
    if (this.overrideStatus) {
      this.emit(this.buildBaseModel(this.overrideStatus, this.overrideMessage(this.overrideStatus)));
      return;
    }

    const lyrics = this.engine.getLyrics();
    if (!lyrics) {
      this.emit(this.buildBaseModel('IDLE', IDLE_MESSAGE));
      return;
    }

    const model = this.engine.getRenderModel(this.currentPosition(), 'DISPLAYING');
    const full: RenderModel = {
      ...model,
      track_title: this.trackTitle,
      track_artist: this.trackArtist,
    };
    this.emit(full);
  }

  private emit(model: RenderModel): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('render:model', model);
    }
  }
}
