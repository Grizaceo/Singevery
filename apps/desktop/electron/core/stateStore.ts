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
import {
  DEFAULT_LYRICS_SOURCES,
  fetchLyricsChain,
  chainResultToTimedLyrics,
} from '../services/lyricsSource';
import { romanizeTimedLyrics } from '../services/romanize';
import { NULL_OFFSET_STORE } from '../services/settings';
import type { OffsetStore } from '../services/settings';
import type { NowPlaying } from '../services/nowPlaying';
import type { RenderModel, Status, TimedLyrics, TrackMatch } from '../../src/types';

export type { RecognitionPhase };

const IDLE_MESSAGE = 'Esperando música...';

export class StateStore {
  private engine: SyncEngine;
  private window: BrowserWindow | null;
  private intervalHandle: NodeJS.Timeout | null = null;

  private trackTitle: string | undefined;
  private trackArtist: string | undefined;
  /** Fuente de la letra cargada ('lrclib' | 'audd' | 'lyrics.ovh' | 'genius').
   *  Para el chip "via <fuente>" en el renderer. */
  private lyricsSource: string | undefined;

  private overrideStatus: Status | null = null;
  private lastMatchKey: string | null = null;
  private currentTrackKey: string | null = null;
  /** TrackKey para el que ya buscamos letra y no había (evita re-fetch infinito:
   *  cuando lrclib da null, getLyrics() queda null y cada tick de SMTC re-buscaría). */
  private noLyricsKey: string | null = null;
  /** TrackKey en fetch en curso. Evita llamadas superpuestas: mientras un fetch
   *  tarda (lrclib/romanize), los ticks de SMTC (~1 s) no disparan otro fetch
   *  para la misma pista. Se limpia al terminar (éxito, no-letra o error). */
  private fetchingKey: string | null = null;

  /** Base de posición SIN offset crónico ni corrección: el "crudo" anclado. */
  private positionMs = 0;
  private anchoredAt = Date.now();

  /** Offset de sincronización persistente (ms). Corrige atraso/adelanto crónico
   *  de la estimación de AudD para esta pista. currentPosition() lo suma en
   *  vivo. Positivo = adelanta la letra, negativo = la atrasa. */
  private syncOffsetMs = 0;

  /** Corrección suave de deriva en curso: se ramplea de 0 a este target. */
  private correctionTargetMs = 0;
  private correctionStartedAt = Date.now();

  /** Pausa (de SMTC/reproductor): congela la posición mostrada. */
  private paused = false;
  private pausedPositionMs = 0;

  private readonly offsetStore: OffsetStore;

  constructor(window: BrowserWindow | null, offsetStore: OffsetStore = NULL_OFFSET_STORE) {
    this.window = window;
    this.engine = new SyncEngine();
    this.offsetStore = offsetStore;
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
    if (!lyrics) this.lyricsSource = undefined; // reset al recargar/sin letra
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
    durationMs?: number,
  ): Promise<void> {
    const trackKey = normalizeTrackKey(artist, title);
    this.currentTrackKey = trackKey;
    this.lastMatchKey = trackKey;
    this.fetchingKey = trackKey; // bloquea fetches superpuestos de la misma pista
    this.syncOffsetMs = this.offsetStore.get(trackKey); // offset crónico persistido
    this.correctionTargetMs = 0;
    this.overrideStatus = 'FETCHING_LYRICS';
    this.trackTitle = title;
    this.trackArtist = artist;

    const debug = process.env.ESPEJO_DEBUG === '1';
    try {
      // Cadena de fuentes: lrclib (synced) → AudD findLyrics → lyrics.ovh → Genius.
      // La primera que responde gana. durationMs (de SMTC/AudD) reparte plain.
      const chainResult = await fetchLyricsChain(
        DEFAULT_LYRICS_SOURCES,
        title,
        artist,
        durationMs,
        debug,
      );
      if (!chainResult) {
        this.setLyrics(null, title, artist);
        this.overrideStatus = 'NO_LYRICS';
        // Marcamos esta pista como "sin letra" para que los ticks de SMTC no
        // la re-busquen cada segundo (getLyrics() queda null).
        this.noLyricsKey = trackKey;
        return;
      }

      // synced → parseLrc (karaoke por palabra si A2); plain → reparte por duración.
      const raw = chainResultToTimedLyrics(chainResult, durationMs);
      if (!raw) {
        this.setLyrics(null, title, artist);
        this.overrideStatus = 'NO_LYRICS';
        this.noLyricsKey = trackKey;
        return;
      }
      this.lyricsSource = chainResult.source; // para el chip "via <fuente>" en UI

      const lyrics = await romanizeTimedLyrics(raw);
      // El crudo anclado se proyecta a "ahora" (el fetch tardó); la posición
      // mostrada = crudo + offset crónico.
      const projected = projectAnchoredPosition(anchorMs, anchorAt);

      this.overrideStatus = null;
      this.noLyricsKey = null; // encontramos letra: limpiar el flag de "sin letra".
      this.setLyrics(lyrics, title, artist);
      this.reanchor(projected.positionMs + this.syncOffsetMs, projected.anchorAt);
    } catch (err) {
      this.setLyrics(null, title, artist);
      this.overrideStatus = 'ERROR';
      this.noLyricsKey = trackKey; // no re-intentar hasta que cambie la pista
      throw err;
    } finally {
      this.fetchingKey = null; // libera el bloqueo sea cual sea el resultado
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
    // duration_ms de AudD (si lo trae) reparte la letra plain sobre la pista.
    const durationMs =
      typeof match.track.duration_ms === 'number' && match.track.duration_ms > 0
        ? match.track.duration_ms
        : undefined;

    const anchor =
      recordStartedAt != null
        ? adjustMatchPosition(match, recordStartedAt)
        : { positionMs: match.position_ms, anchorAt: match.matched_at };

    if (this.lastMatchKey === matchKey && this.engine.getLyrics()) {
      // Misma canción: reconciliar deriva sin recargar ni tapar la letra.
      this.applyCorrection(anchor);
      if (this.overrideStatus === 'LISTENING' || this.overrideStatus === 'IDENTIFYING') {
        this.overrideStatus = null;
      }
      return false;
    }

    await this.loadLyricsByMetadata(title, artist, anchor.positionMs, anchor.anchorAt, durationMs);
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

  /** Congela/reanuda la posición mostrada (pausa del reproductor). */
  setPaused(p: boolean): void {
    if (p === this.paused) return;
    const now = Date.now();
    if (p) {
      this.pausedPositionMs = this.currentPosition(now);
      this.paused = true;
    } else {
      this.paused = false;
      this.reanchor(this.pausedPositionMs, now);
    }
  }

  /**
   * Aplica una lectura del reproductor (Windows SMTC) como fuente de posición
   * de máxima precisión. Identifica la canción, ancla la posición exacta y
   * maneja play/pausa. Es preferible a AudD cuando está disponible.
   */
  async applyNowPlaying(np: NowPlaying): Promise<void> {
    const key = normalizeTrackKey(np.artist, np.title);

    // Cargamos letra solo si es canción nueva Y no sabemos ya que no tiene
    // letra (noLyricsKey) Y no hay un fetch en curso para esta pista
    // (fetchingKey). Esto evita un bucle de re-fetch: cuando lrclib no
    // encuentra letra, getLyrics() queda null y, sin estos guards, cada tick
    // de SMTC (~1 s) re-buscaría la misma pista; y mientras un fetch tarda,
    // nuevos ticks dispararían fetches superpuestos.
    const isNewSong = key !== this.lastMatchKey || !this.engine.getLyrics();
    const alreadyKnownNoLyrics = key === this.noLyricsKey;
    const fetchInProgress = key === this.fetchingKey;

    if (isNewSong && !alreadyKnownNoLyrics && !fetchInProgress) {
      // Canción nueva (o sin letra aún): cargar letra anclada a la posición real.
      // durationMs de SMTC reparte la letra plain sobre la duración de la pista.
      this.paused = false;
      await this.loadLyricsByMetadata(
        np.title,
        np.artist,
        np.positionMs,
        np.atEpochMs,
        np.durationMs,
      );
      this.setPaused(!np.playing);
      return;
    }

    if (fetchInProgress) {
      // Fetch en curso: solo reflejar pausa, no re-buscar.
      this.setPaused(!np.playing);
      return;
    }

    if (alreadyKnownNoLyrics && key !== this.lastMatchKey) {
      // Misma pista marcada sin letra: registrar título/artista para el UI sin
      // re-buscar, y reflejar pausa.
      this.trackTitle = np.title;
      this.trackArtist = np.artist;
      this.lastMatchKey = key;
      this.overrideStatus = 'NO_LYRICS';
      this.setPaused(!np.playing);
    }

    // Misma canción: SMTC es autoritativo. Anclamos a su posición exacta y
    // reflejamos play/pausa. Solo re-anclamos si hay desvío apreciable
    // (evita jitter innecesario entre lecturas).
    if (np.playing) {
      this.paused = false;
      const target = np.positionMs + this.syncOffsetMs;
      if (Math.abs(target - this.currentPosition(np.atEpochMs)) > 120) {
        this.reanchor(target, np.atEpochMs);
      }
    } else {
      this.pausedPositionMs = np.positionMs + this.syncOffsetMs;
      this.paused = true;
    }
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
    if (this.paused) return this.pausedPositionMs;
    const elapsed = Math.max(0, now - this.anchoredAt);
    return (
      this.positionMs +
      elapsed +
      this.syncOffsetMs +
      rampedCorrection(this.correctionTargetMs, this.correctionStartedAt, now)
    );
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
      lyrics_source: this.lyricsSource,
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
      lyrics_source: this.lyricsSource,
    };
    this.emit(full);
  }

  private emit(model: RenderModel): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('render:model', model);
    }
  }
}
