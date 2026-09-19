// ============================================================================
// StateStore — mantiene el estado canónico del widget y emite el RenderModel
// al renderer por IPC a ~10 Hz.
//
// Modularizado (2026-08-03): el reloj de sincronía vive en SyncClock
// (core/syncClock.ts), el auto-reintento en AutoRetry (core/autoRetry.ts) y
// el auto-contraste en colorUtils (core/colorUtils.ts). StateStore conserva
// la API pública original: arbitraje SMTC/mic, histéresis, carga de letra y
// emisión del modelo.
// ============================================================================

import { BrowserWindow } from 'electron';
import { SyncEngine } from './syncEngine';
import { SyncClock } from './syncClock';
import { AutoRetry } from './autoRetry';
import { DisplayAppearance } from './displayAppearance';
import { IdentityArbiter, type WrongSongStrikes, type AudioBoundaryKind } from './identityArbiter';
import {
  adjustMatchPosition,
  projectAnchoredPosition,
  computeDrift,
  normalizeTrackKey,
} from './syncTiming';
import type { RecognitionPhase } from './syncTiming';
import { looksLikeSameTrack } from '../services/lyrics/normalizeQuery';
import { isDistinctiveTitle, scoreTitleDistinctiveness } from '../services/lyrics/titleDistinctiveness';
import {
  ENERGY_BIN_MS,
  ENERGY_SYNC_MAX_CORRECTION_MS,
  ENERGY_SYNC_MIN_CONFIDENCE,
  buildLyricsActivityMask,
  buildVocalMaskFromPcm,
  correlateEnergyMask,
  type EnergyCorrelation,
} from './energySync';
import { decodeWav } from './wavDecode';
import { LyricsService, defaultLyricsService } from '../services/lyrics/lyricsService';
import { NULL_OFFSET_STORE, NULL_CALIBRATION_STORE, NULL_DISPLAY_STORE, NULL_TRANSLATION_STORE, NULL_READING_STORE } from '../services/settings';
import type { OffsetStore, CalibrationStore, DisplayStore, TranslationStore, ReadingStore } from '../services/settings';
import { translateLines } from '../services/translate';
import type { RenderModel, Status, TimedLyrics, TrackMatch } from '../../src/types';

export type { RecognitionPhase, WrongSongStrikes, AudioBoundaryKind };

const IDLE_MESSAGE = 'Esperando música...';

/** Estado interno expuesto al endpoint de diagnóstico (solo lectura). */
export interface StateDiagnostics {
  status: Status;
  overrideStatus: Status | null;
  track: { title: string; artist: string; key: string | null; aliasKeys: string[] } | null;
  lyrics: { source: string; synced: boolean; lines: number; translationLang: string | null } | null;
  /** true si la pista mostrada es una identidad firme (no un hint genérico). */
  locked: boolean;
  provisional: boolean;
  titleDistinctiveness: number | null;
  identity: {
    /** Racha del audio insistiendo en otra canción (null si no hay). */
    wrongSong: WrongSongStrikes | null;
    /** Confirmaciones que hacen falta AHORA para soltar el lock. */
    requiredHits: number;
    /** true si la sesión del SO sigue afirmando la canción que se muestra. */
    osStillConfirmsCurrent: boolean;
    recognitionSource: 'microphone' | 'system' | null;
    externalTrusted: boolean;
    externalInputSuppressed: boolean;
    lastExternalTitle: { title: string; artist: string; at: number } | null;
    lastUnmatchedExternal: { title: string; artist: string; at: number } | null;
    autoRetryPending: boolean;
    /** Último corte de pista que reportó el monitor local de audio. */
    lastAudioBoundary: { kind: AudioBoundaryKind; at: number } | null;
  };
  sync: {
    displayedPositionMs: number;
    offsetMs: number;
    calibrationOffsetMs: number;
    paused: boolean;
    clock: ReturnType<SyncClock['getDiagnostics']>;
    /** Última medición por correlación de energía vocal (null si no hubo). */
    energy: EnergyMeasurement | null;
  };
}

/** Resultado de una pasada de correlación de energía, con su desenlace. */
export interface EnergyMeasurement extends EnergyCorrelation {
  at: number;
  /** Posición nominal del inicio de la ventana analizada. */
  windowStartMs: number;
  bins: number;
  /** true si la corrección se aplicó al reloj (false = solo se observó). */
  applied: boolean;
  /** Por qué no se aplicó, cuando corresponde. */
  skipped?: string;
}

export class StateStore {
  private engine: SyncEngine;
  private window: BrowserWindow | null;
  private intervalHandle: NodeJS.Timeout | null = null;

  /** Reloj de sincronía delegado (posición, offsets, corrección, pausa). */
  private readonly clock: SyncClock;
  /** Auto-reintento de búsqueda de letra con backoff. */
  private readonly autoRetry = new AutoRetry();

  private trackTitle: string | undefined;
  private trackArtist: string | undefined;
  /** Duración de la pista en curso (ms), si alguna fuente la reportó. Sirve de
   *  cota superior para las posiciones externas: ver applyExternalPosition. */
  private trackDurationMs: number | null = null;

  private overrideStatus: Status | null = null;
  private lastMatchKey: string | null = null;
  private currentTrackKey: string | null = null;

  // Claves alias de la pista ACTUAL. La misma canción llega con metadata
  // distinta según la fuente (AudD: "Houdini"/"Dua Lipa"; SMTC de YouTube:
  // "Dua Lipa - Houdini (Official Video)"/"DuaLipaVEVO"). Cuando la identidad
  // difusa (looksLikeSameTrack) reconoce a un recién llegado como la pista en
  // curso, su clave se registra aquí para resolver los próximos eventos por
  // comparación exacta (barata) y sin recargar la letra.
  private trackAliasKeys = new Set<string>();

  /** Arbitraje "¿en quién confiar: MPRIS/SMTC o el audio?" (ver identityArbiter.ts). */
  private readonly identity: IdentityArbiter;

  private pendingAnchor: { key: string | null; position: number; at: number; sampleAt: number } | null = null;

  /** Holgura al comparar una posición externa con la duración de la pista: las
   *  duraciones de SMTC y del reconocedor no coinciden al segundo. */
  private static readonly EXTERNAL_POSITION_SLACK_MS = 5_000;

  /** Pide al renderer re-identificar YA (cambio de pista no confirmable). */
  private resyncRequester: (() => void) | null = null;
  /** -Infinity y no 0: con 0 la primera petición quedaba dentro del throttle. */
  private lastResyncRequestAt = Number.NEGATIVE_INFINITY;
  /** Mínimo entre peticiones de resync: un ciclo de captura completo. */
  private static readonly RESYNC_THROTTLE_MS = 10_000;

  private readonly displayStore: DisplayStore;
  private readonly translationStore: TranslationStore;
  private readonly lyricsService: LyricsService;
  private readonly appearance: DisplayAppearance;

  /** Último modelo emitido (para feedback de precisión / diagnósticos). */
  private lastModel: RenderModel | null = null;

  /** Última correlación de energía vocal (se expone en /debug). */
  private lastEnergyMeasurement: EnergyMeasurement | null = null;
  /**
   * Si la corrección por energía TOCA el reloj o solo se observa.
   *
   * Arranca apagada a propósito. La correlación se valida bien con señales
   * sintéticas, pero mover la letra sola con música real es el peor fallo
   * posible de este widget: si la medición se equivoca, el usuario ve la letra
   * saltar sin motivo. En modo observación la medición igual queda registrada
   * en /debug, así que se puede comprobar contra canciones reales ANTES de
   * dejarla mandar. Se enciende con SINGEVERY_ENERGY_SYNC=1.
   */
  private energySyncEnabled = false;

  /** Devuelve el último RenderModel emitido, o null si nunca se emitió. */
  getLastModel(): RenderModel | null {
    return this.lastModel;
  }

  /**
   * Radiografía del arbitraje de identidad y del reloj, para el endpoint de
   * diagnóstico. Solo lectura: no toca nada y no debe cambiar comportamiento.
   * Existe porque estos estados (qué está lockeado, por qué no cambió de
   * canción, cuánta deriva hay) son invisibles desde la pantalla del widget.
   */
  getDiagnostics(at: number = Date.now()): StateDiagnostics {
    const lyrics = this.engine.getLyrics();
    const title = this.trackTitle ?? null;
    return {
      // Antes del primer tick no hay modelo emitido: se deduce del estado real
      // para que consultar /debug durante el arranque no mienta un IDLE.
      status: this.lastModel?.status ?? this.overrideStatus ?? (lyrics ? 'DISPLAYING' : 'IDLE'),
      overrideStatus: this.overrideStatus,
      track:
        title != null || this.trackArtist != null
          ? {
              title: title ?? '',
              artist: this.trackArtist ?? '',
              key: this.currentTrackKey,
              aliasKeys: [...this.trackAliasKeys],
            }
          : null,
      lyrics: lyrics
        ? {
            source: lyrics.source,
            synced: lyrics.synced,
            lines: lyrics.lines.length,
            translationLang: lyrics.translationLang ?? null,
          }
        : null,
      // "Lockeada" = hay letra en pantalla y su identidad NO es provisional.
      locked: lyrics != null && !this.identity.currentTrackProvisional,
      provisional: this.identity.currentTrackProvisional,
      titleDistinctiveness: title ? scoreTitleDistinctiveness(title) : null,
      identity: {
        wrongSong: this.identity.wrongSong ? { ...this.identity.wrongSong } : null,
        requiredHits: this.identity.osStillConfirmsCurrentTrack(this.trackTitle, this.trackArtist, at)
          ? this.identity.wrongSongStrikeLimit
          : this.identity.changeConfirmCount,
        osStillConfirmsCurrent: this.identity.osStillConfirmsCurrentTrack(this.trackTitle, this.trackArtist, at),
        recognitionSource: this.identity.recognitionSource,
        externalTrusted: this.identity.externalTrusted,
        externalInputSuppressed: this.identity.externalInputSuppressed,
        lastExternalTitle: this.identity.lastExternalTitle,
        lastUnmatchedExternal: this.identity.lastUnmatchedExternal,
        autoRetryPending: this.autoRetry.isPending,
        lastAudioBoundary: this.identity.lastAudioBoundary ? { ...this.identity.lastAudioBoundary } : null,
      },
      sync: {
        displayedPositionMs: Math.round(this.clock.getDisplayedPosition(at)),
        offsetMs: this.clock.getSyncOffsetMs(),
        calibrationOffsetMs: this.clock.getCalibrationOffsetMs(),
        paused: this.clock.isClockPaused(),
        clock: this.clock.getDiagnostics(),
        energy: this.lastEnergyMeasurement,
      },
    };
  }

  constructor(
    window: BrowserWindow | null,
    offsetStore: OffsetStore = NULL_OFFSET_STORE,
    lyricsService: LyricsService = defaultLyricsService,
    calibrationStore: CalibrationStore = NULL_CALIBRATION_STORE,
    displayStore: DisplayStore = NULL_DISPLAY_STORE,
    translationStore: TranslationStore = NULL_TRANSLATION_STORE,
    readingStore: ReadingStore = NULL_READING_STORE,
  ) {
    this.window = window;
    this.engine = new SyncEngine();
    this.lyricsService = lyricsService;
    this.displayStore = displayStore;
    this.translationStore = translationStore;
    this.appearance = new DisplayAppearance(displayStore, readingStore);
    this.clock = new SyncClock(offsetStore, calibrationStore);
    this.identity = new IdentityArbiter({
      isPausedByExternal: () => this.clock.getDiagnostics().pauseSource === 'external',
      releaseExternalPause: () => this.clock.releaseExternalPause(),
    });
    this.applyDisplaySettings();
    this.applyReadingSettings();
  }

  /** Sincroniza ajustes de lectura (pinyin, norma del español) con romanize.ts. */
  applyReadingSettings(): void {
    this.appearance.applyReadingSettings();
  }

  /** Sincroniza ajustes visuales persistidos con el SyncEngine. */
  applyDisplaySettings(): void {
    const d = this.displayStore.get();
    this.engine.renderConfig.fontScale = d.fontScale;
    this.engine.renderConfig.opacity = d.opacity;
    this.engine.renderConfig.alignment = d.alignment;
    this.engine.renderConfig.mirrorMode = d.mirrorMode;
    this.engine.renderConfig.windowSize = d.lyricsWindowSize;
    if (this.appearance.isManualTextColor()) {
      this.clearAutoContrast();
    }
  }

  /** Actualiza el color efectivo desde el servicio de auto-contraste. */
  setAutoContrast(color: string, lightBackground: boolean): void {
    this.appearance.setAutoContrast(color, lightBackground);
  }

  /** Limpia el override de auto-contraste (vuelve al color manual). */
  clearAutoContrast(): void {
    this.appearance.clearAutoContrast();
  }

  attachWindow(window: BrowserWindow): void {
    this.window = window;
  }

  /**
   * Enlaza el disparador de re-identificación inmediata. Se llama cuando el
   * reproductor del SO reporta una pista que el arbitraje no puede confirmar:
   * es señal fiable de que ALGO cambió, aunque su metadata no sirva para saber
   * qué. Con throttle para no encadenar capturas.
   */
  setResyncRequester(cb: (() => void) | null): void {
    this.resyncRequester = cb;
  }

  private requestResync(at: number): void {
    if (!this.resyncRequester) return;
    if (at - this.lastResyncRequestAt < StateStore.RESYNC_THROTTLE_MS) return;
    this.lastResyncRequestAt = at;
    this.resyncRequester();
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
    this.autoRetry.cancel();
  }

  /** Reintenta la búsqueda limpiando la entrada de caché (incluida la negativa)
   *  y preservando reloj y estado de pausa. Público para el IPC lyrics:retry. */
  async retrySearch(
    title: string,
    artist: string,
    album: string | null = null,
    durationMs: number | null = null,
  ): Promise<void> {
    const key = normalizeTrackKey(artist, title);
    // Llamada opcional: los dobles de test del LyricsService pueden no tenerla.
    await this.lyricsService.forgetTrack?.(key);
    const now = Date.now();
    const wasPaused = this.clock.isClockPaused();
    // Ancla cruda actual (sin offset crónico: loadLyricsByMetadata lo re-suma).
    const rawAnchor = Math.max(0, this.clock.getDisplayedPosition(now) - this.clock.getSyncOffsetMs());
    try {
      await this.loadLyricsByMetadata(title, artist, rawAnchor, now, album, durationMs);
    } catch {
      // loadLyricsByMetadata ya dejó overrideStatus en ERROR y re-programó.
    }
    if (wasPaused) this.clock.pauseClock();
  }

  setLyrics(lyrics: TimedLyrics | null, title?: string, artist?: string): void {
    this.engine.setLyrics(lyrics);
    this.trackTitle = title;
    this.trackArtist = artist;
  }

  /** Carga una letra elegida por el usuario sin consultar ni guardar en caché
   *  de proveedores. Conserva el offset que ya exista para esa pista. */
  setImportedLyrics(
    lyrics: TimedLyrics,
    title: string,
    artist: string,
    anchorMs = 0,
    anchorAt = Date.now(),
  ): void {
    const trackKey = normalizeTrackKey(artist, title);
    this.autoRetry.cancel();
    this.trackAliasKeys.clear();
    this.identity.wrongSong = null;
    // La eligió el usuario: es la verdad, no un hint.
    this.identity.currentTrackProvisional = false;
    this.currentTrackKey = trackKey;
    this.lastMatchKey = trackKey;
    // Letra elegida a mano: no sabemos a qué grabación corresponde, así que no
    // hay duración de referencia contra la que acotar posiciones externas.
    this.trackDurationMs = null;
    this.autoRetry.reset();
    this.clock.setCurrentTrackKey(trackKey);
    this.clock.loadSyncOffset(trackKey);
    this.overrideStatus = null;
    this.pendingAnchor = null;
    this.clock.resetPlaybackState();
    this.setLyrics(lyrics, title, artist);
    this.clock.reanchor(Math.max(0, anchorMs) + this.clock.getSyncOffsetMs(), anchorAt);
  }

  /** Traduce la letra actual al idioma destino y actualiza caché. */
  async requestTranslation(): Promise<{ ok: boolean; error?: string }> {
    const lyrics = this.engine.getLyrics();
    if (!lyrics || !this.currentTrackKey) {
      return { ok: false, error: 'No hay letra cargada' };
    }

    // F1: identidad capturada al INICIO. Si durante el fetch de traducción el
    // audio identifica otra canción, el resultado se descarta: aplicar la
    // traducción de A sobre B contaminaría la letra y la caché de B.
    const trackKeyAtStart = this.currentTrackKey;
    const titleAtStart = this.trackTitle;
    const artistAtStart = this.trackArtist;

    const config = this.translationStore.get();
    const targetLang = config.targetLang;
    const alreadyDone =
      lyrics.translationLang === targetLang && lyrics.lines.every((l) => l.translation != null);
    if (alreadyDone) return { ok: true };

    const result = await translateLines(
      lyrics.lines.map((l) => l.text),
      config,
    );
    if (!result.ok || !result.translations) {
      return { ok: false, error: result.error ?? 'Error de traducción' };
    }

    // La canción cambió mientras traducíamos: descartar (F1).
    if (this.currentTrackKey !== trackKeyAtStart) {
      return { ok: false, error: 'La canción cambió durante la traducción' };
    }

    const updated: TimedLyrics = {
      ...lyrics,
      translationLang: targetLang,
      lines: lyrics.lines.map((line, i) => ({
        ...line,
        translation: result.translations![i],
      })),
    };

    this.setLyrics(updated, titleAtStart, artistAtStart);
    await this.lyricsService.updateCachedLyrics(trackKeyAtStart, updated, {
      title: titleAtStart ?? '',
      artist: artistAtStart ?? '',
      album: null,
      durationMs: null,
    });
    return { ok: true };
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
    const isNewTrack = trackKey !== this.currentTrackKey;
    // Identidad nueva: limpiar aliases y contador de reintentos de la anterior.
    if (isNewTrack) {
      this.trackAliasKeys.clear();
      this.autoRetry.reset();
      // Pista distinta = la desalineación anterior ya no aplica.
      this.identity.mismatchResyncs = 0;
    }
    this.autoRetry.cancel();
    this.currentTrackKey = trackKey;
    this.lastMatchKey = trackKey;
    this.clock.setCurrentTrackKey(trackKey);
    this.clock.loadSyncOffset(trackKey); // offset crónico persistido + resetea corrección
    // Cargar una pista nueva implica que hay audio sonando: salir de pausa.
    this.pendingAnchor = null;
    this.clock.resetPlaybackState();
    this.overrideStatus = 'FETCHING_LYRICS';
    this.trackTitle = title;
    this.trackArtist = artist;
    // Solo se pisa cuando la fuente la trae: un evento sin duración (el sidecar
    // la omite si su timeline todavía es el de la pista anterior) no debe
    // borrar la que ya conocíamos.
    if (durationMs != null && durationMs > 0) this.trackDurationMs = durationMs;
    else if (isNewTrack) this.trackDurationMs = null;

    try {
      // El servicio busca (cache-first), parsea y romaniza; devuelve TimedLyrics.
      const lyrics = await this.lyricsService.getLyrics({ title, artist, album, durationMs });
      // Mientras buscábamos pudo cargarse otra pista: no pisar su estado.
      if (this.currentTrackKey !== trackKey) return;
      if (!lyrics) {
        this.setLyrics(null, title, artist);
        this.overrideStatus = 'NO_LYRICS';
        this.scheduleAutoRetry(trackKey, title, artist, album, durationMs);
        return;
      }

      // El crudo anclado se proyecta a "ahora" (el fetch tardó); la posición
      // mostrada = crudo + offset crónico.
      const projected = projectAnchoredPosition(anchorMs, anchorAt);

      this.overrideStatus = null;
      this.autoRetry.reset();
      this.setLyrics(lyrics, title, artist);
      this.clock.reanchor(projected.positionMs + this.clock.getSyncOffsetMs(), projected.anchorAt);
    } catch (err) {
      if (this.currentTrackKey === trackKey) {
        this.setLyrics(null, title, artist);
        this.overrideStatus = 'ERROR';
        this.scheduleAutoRetry(trackKey, title, artist, album, durationMs);
      }
      throw err;
    }
  }

  /** Programa el reintento automático delegando en AutoRetry. */
  private scheduleAutoRetry(
    trackKey: string,
    title: string,
    artist: string,
    album: string | null,
    durationMs: number | null,
  ): void {
    this.autoRetry.schedule(trackKey, () => this.currentTrackKey, () =>
      this.retrySearch(title, artist, album, durationMs).then(() => undefined),
    );
  }

  /**
   * ¿La metadata entrante refiere a la pista actualmente cargada, aunque su
   * clave exacta difiera? Compara por alias ya resueltos y, si no, por
   * identidad difusa (título de video vs metadata canónica). Registra el alias
   * para resolver los próximos eventos con comparación exacta.
   */
  private matchesCurrentTrack(key: string, title: string, artist: string): boolean {
    if (this.lastMatchKey === key) return true;
    if (this.trackAliasKeys.has(key)) return true;
    if (!this.trackTitle || !this.trackArtist) return false;
    const same = looksLikeSameTrack(
      { title, artist },
      { title: this.trackTitle, artist: this.trackArtist },
    );
    if (same) this.trackAliasKeys.add(key);
    return same;
  }

  /**
   * El monitor local de audio vio un corte de pista. Solo se anota: la letra
   * NO se toca aquí. Quien decide sigue siendo el fingerprint; el corte es la
   * evidencia que le permite confirmar el cambio a la primera.
   *
   * No dispara un resync por su cuenta a propósito: el renderer, que es quien
   * lo detectó, ya corta su pausa y re-identifica de inmediato.
   */
  noteAudioBoundary(kind: AudioBoundaryKind, at: number = Date.now()): void {
    this.identity.noteAudioBoundary(kind, at);
  }

  /**
   * ¿Hay un cambio de canción a medio confirmar? El renderer lo consulta tras
   * cada corrección para encadenar el ciclo siguiente sin pausa: la histéresis
   * necesita otra identificación y esperarla 12 s deja la letra vieja en
   * pantalla todo ese rato.
   */
  isChangeSuspected(): boolean {
    return this.identity.isChangeSuspected();
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
    const { title, artist, album, duration_ms } = match.track;
    const matchKey = normalizeTrackKey(artist, title);

    const anchor =
      recordStartedAt != null
        ? adjustMatchPosition(match, recordStartedAt, this.clock.getCalibrationOffsetMs())
        : { positionMs: match.position_ms, anchorAt: match.matched_at };

    // Misma canción (por clave exacta, alias o identidad difusa — la metadata
    // de AudD y la del SMTC de un navegador difieren para el mismo tema):
    // reconciliar deriva sin recargar ni tapar la letra. Confirmar la pista
    // actual descarta cualquier cambio pendiente.
    if (this.engine.getLyrics() && this.matchesCurrentTrack(matchKey, title, artist)) {
      this.identity.wrongSong = null;
      // El fingerprint dice que sigue sonando lo mismo: si había un corte
      // anotado, no era un cambio de canción (una pausa, un bache de volumen).
      // Descartarlo evita que corrobore una mis-identificación posterior.
      this.identity.lastAudioBoundary = null;
      // Dos señales independientes (título del SO + huella del audio) dicen lo
      // mismo: la identidad deja de ser provisional y pasa a estar lockeada.
      this.identity.currentTrackProvisional = false;
      // Un match sin timecode (position_ms=0, p.ej. AudD omitiéndolo en una
      // mezcla con voz) no puede re-anclar: su posición cae al inicio del
      // chunk (~6s) aunque la canción lleve minutos, y un snap así rompe la
      // letra. La deriva real (segundos) la corrige el próximo match con
      // timecode. Se calcula aquí y se propaga a applyCorrection.
      const positionTrusted = match.position_ms > 0 || (match.sample_offset_ms ?? 0) > 0;
      this.applyCorrection(anchor, positionTrusted, match, recordStartedAt);
      if (this.overrideStatus === 'LISTENING' || this.overrideStatus === 'IDENTIFYING') {
        this.overrideStatus = null;
      }
      return false;
    }

    // Corroboración de dos fuentes independientes: si SMTC ya reportó una
    // pista (bloqueada por el arbitraje) y este match de AudD la reconoce como
    // la misma canción, el cambio es real → confirmar sin esperar la
    // histéresis (ahorra un ciclo de corrección de ~18s).
    const now = Date.now();
    const ext = this.identity.lastUnmatchedExternal;
    const corroboratedByOs =
      ext != null &&
      now - ext.at < this.identity.externalCorroborationTtlMs &&
      looksLikeSameTrack({ title, artist }, ext);

    // Misma idea, pero con la señal que SÍ existe cuando no hay reproductor
    // accesible (parlante externo, micrófono): el monitor local oyó el hueco
    // de silencio entre pistas justo antes de este match. Dos señales
    // independientes → cambio confirmado a la primera.
    const corroboratedByAudio =
      !corroboratedByOs && this.identity.boundaryCorroborates(now, this.trackTitle, this.trackArtist);
    const corroborated = corroboratedByOs || corroboratedByAudio;

    // Histéresis compartida (mic + SMTC): un cambio de pista no se aplica al
    // primer indicio; una mis-identificación puntual no debe arrancar la letra.
    if (
      !corroborated &&
      !this.identity.confirmTrackChange(matchKey, Boolean(this.engine.getLyrics()), this.trackTitle, this.trackArtist)
    ) {
      // Aún no confirmado: mantener la letra actual intacta (no tocar la
      // posición: el anchor es de otra pista y desincronizaría la de ahora).
      return false;
    }
    if (corroborated) {
      this.identity.wrongSong = null;
    }
    if (corroboratedByAudio) {
      console.log(
        `[identidad] corte de audio reciente + match distinto ("${matchKey}") → ` +
          'cambio confirmado sin histéresis',
      );
    }
    // El corte ya cumplió su función: consumirlo para que no corrobore también
    // el próximo match (una mis-identificación posterior no debe heredar la
    // evidencia de un hueco que ya se explicó).
    this.identity.lastAudioBoundary = null;

    // El reconocimiento por audio identifica lo que SUENA: la pista deja de ser
    // provisional aunque haya entrado por un título genérico del SO.
    this.identity.currentTrackProvisional = false;
    await this.loadLyricsByMetadata(
      title,
      artist,
      anchor.positionMs,
      anchor.anchorAt,
      album ?? null,
      duration_ms ?? null,
    );
    if (this.currentTrackKey !== matchKey) return true;
    if (corroboratedByOs && ext) {
      // La sesión SMTC bloqueada ERA esta canción: registrar su clave como
      // alias (los próximos eventos 'track' resuelven por comparación exacta)
      // y volver a confiar en sus posiciones.
      this.trackAliasKeys.add(normalizeTrackKey(ext.artist, ext.title));
      this.identity.externalTrusted = true;
      this.identity.lastUnmatchedExternal = null;
    }
    this.identity.refreshExternalTrust(this.trackTitle, this.trackArtist);
    return true;
  }

  /** Enciende o apaga la corrección automática por energía vocal. */
  setEnergySyncEnabled(enabled: boolean): void {
    this.energySyncEnabled = enabled;
  }

  isEnergySyncEnabled(): boolean {
    return this.energySyncEnabled;
  }

  /**
   * Analiza un chunk de audio ya grabado y mide el desfase de la letra por
   * correlación de energía vocal.
   *
   * Reutiliza el audio que YA se envía al reconocedor cada ~18 s: no hace
   * falta capturar nada aparte ni tocar el renderer. `recordStartedAt` es el
   * instante de pared en que empezó la grabación; con él se sabe qué posición
   * de la canción creía el widget que sonaba en ese momento, que es la línea
   * de tiempo contra la que se compara la letra.
   *
   * Devuelve la medición (o null si no había nada que medir).
   */
  reportAudioWindow(
    audio: ArrayBuffer | Uint8Array | Buffer,
    recordStartedAt: number,
    at: number = Date.now(),
  ): EnergyMeasurement | null {
    const lyrics = this.engine.getLyrics();
    // Sin letra sincronizada no hay máscara contra la cual correlacionar.
    if (!lyrics?.synced || lyrics.lines.length === 0) return null;
    if (this.clock.isClockPaused()) return null;
    // The clock has no historical segments: never extrapolate through a reanchor.
    if (recordStartedAt < this.clock.getDiagnostics().anchoredAt) return null;

    const decoded = decodeWav(audio);
    if (!decoded) return null;

    const { mask: audioMask } = buildVocalMaskFromPcm(decoded.samples, decoded.sampleRate);
    if (audioMask.length === 0 || !audioMask.some(Boolean)) return null;

    // Posición que el widget creía tener cuando arrancó la grabación.
    const windowStartMs = Math.max(0, this.clock.getDisplayedPosition(recordStartedAt));
    const startBin = Math.floor(windowStartMs / ENERGY_BIN_MS);
    const lrcMask = buildLyricsActivityMask(lyrics.lines, startBin, audioMask.length, ENERGY_BIN_MS);

    const correlation = correlateEnergyMask(lrcMask, audioMask);
    const measurement: EnergyMeasurement = {
      ...correlation,
      at,
      windowStartMs: Math.round(windowStartMs),
      bins: audioMask.length,
      applied: false,
    };

    // DISPARADOR DE CAMBIO DE CANCIÓN (P1): cuando hay voz clara en el audio
    // pero la letra mostrada no se alinea en NINGÚN desfase razonable, es la
    // huella de que ya no suena la canción que se muestra. Dos señales:
    //   - Correlación baja: el patrón vocal no responde a la máscara actual.
    //   - Desfase absurdo: ni aun desplazando todo coincide.
    // Disparar una re-identificación inmediata (en vez de esperar el ciclo de
    // ~18s) acorta la detección del cambio de tema de decenas de segundos a
    // unos pocos. El throttle de RESYNC_THROTTLE_MS evita que encadene
    // resyncs; AudD resuelve la ambigüedad (estribillo repetido) confirmando
    // la misma pista, con lo que el resync se vuelve una corrección inofensiva.
    this.identity.maybeRequestResyncOnMiss(
      correlation,
      at,
      Boolean(this.engine.getLyrics()),
      this.resyncRequester ? (t: number) => this.requestResync(t) : null,
    );

    if (correlation.confidence < ENERGY_SYNC_MIN_CONFIDENCE) {
      measurement.skipped = `confianza ${correlation.confidence.toFixed(2)} < ${ENERGY_SYNC_MIN_CONFIDENCE}`;
    } else if (Math.abs(correlation.offsetMs) > ENERGY_SYNC_MAX_CORRECTION_MS) {
      // Una corrección enorme casi siempre es un mal alineamiento, no una
      // deriva: la deriva real se acumula de a décimas.
      measurement.skipped = `corrección ${correlation.offsetMs}ms fuera del tope`;
    } else if (correlation.offsetMs === 0) {
      measurement.skipped = 'ya alineado';
    } else if (!this.energySyncEnabled) {
      measurement.skipped = 'modo observación (SINGEVERY_ENERGY_SYNC apagado)';
    } else {
      // Se aplica por la MISMA rampa suave que la deriva de AudD: la letra se
      // acomoda sin saltar.
      this.clock.startCorrection(correlation.offsetMs, at);
      measurement.applied = true;
      console.log(
        `[energía] desfase ${correlation.offsetMs}ms (confianza ${correlation.confidence.toFixed(2)}, ` +
          `pico ${correlation.peak.toFixed(2)} vs ${correlation.runnerUp.toFixed(2)}) → corregido`,
      );
    }

    this.lastEnergyMeasurement = measurement;
    return measurement;
  }

  /**
   * Reconcilia la posición estimada por un match con la mostrada ahora.
   * Suave por defecto (rampa de una fracción del error); salto duro si el error
   * es enorme (seek/cambio brusco); se ignora si es minúsculo (anti-jitter).
   *
   * `positionTrusted=false` → el ancla no tiene posición creíble (timecode 0):
   * NO se aplica ninguna corrección (la proyección caería al inicio del chunk).
   */
  private applyCorrection(
    anchor: { positionMs: number; anchorAt: number },
    positionTrusted: boolean,
    match: TrackMatch,
    recordStartedAt?: number,
  ): void {
    const now = Date.now();
    // Estimación real "ahora" según el match = crudo proyectado + offset crónico.
    const estimatedNow =
      anchor.positionMs + Math.max(0, now - anchor.anchorAt) + this.clock.getSyncOffsetMs();

    console.log('[sync] anchor', JSON.stringify({ provider: match.track.provider, position_ms: match.position_ms,
      sample_offset_ms: match.sample_offset_ms ?? 0, matched_at: match.matched_at, recordStartedAt,
      ...anchor, estimatedNow, positionTrusted, ...this.clock.getDiagnostics() }));

    // Ancla sin timecode: el crudo es 0 y la proyección caería al inicio del
    // chunk (~6s) aunque la canción lleve minutos. Aplicarla es un snap
    // destructivo (ver applyMatch); ignorarla deja correr la letra y la deriva
    // la corrige el próximo match con timecode.
    if (!positionTrusted) {
      console.log(
        `[sync] match sin timecode (position_ms=0): se ignora el ancla ` +
          `(mostrado=${Math.round(this.clock.getDisplayedPosition(now))}ms, ` +
          `proyección corrupta=${Math.round(estimatedNow)}ms)`,
      );
      return;
    }

    const decision = computeDrift(estimatedNow, this.clock.getDisplayedPosition(now));

    // Diagnóstico de sincronía: el signo del error debe alternar alrededor de
    // 0. Un sesgo persistente del mismo signo delata un problema de anclaje
    // (referencia del position_ms del proveedor), no deriva del reloj.
    console.log(
      `[sync] error=${Math.round(decision.errorMs)}ms acción=${decision.action} ` +
        `(mostrado=${Math.round(this.clock.getDisplayedPosition(now))}ms, medido=${Math.round(estimatedNow)}ms)`,
    );

    if (decision.action !== 'snap') this.pendingAnchor = null;
    if (decision.action === 'ignore') return;
    if (decision.action === 'snap') {
      const sampleAt = recordStartedAt ?? match.matched_at;
      const pending = this.pendingAnchor;
      if (pending && sampleAt <= pending.sampleAt) return;
      const corroborated = pending != null && pending.key === this.currentTrackKey &&
        now - pending.at <= this.identity.externalCorroborationTtlMs &&
        computeDrift(estimatedNow, pending.position + Math.max(0, now - pending.at)).action !== 'snap';
      if (!corroborated) {
        this.pendingAnchor = { key: this.currentTrackKey, position: estimatedNow, at: now, sampleAt };
        console.log(`[sync] quarantined position_ms=${estimatedNow} sample_at=${sampleAt}`);
        this.requestResync(now);
        return;
      }
      this.pendingAnchor = null;
      console.log(`[sync] corroborated seek position_ms=${estimatedNow}`);
      this.clock.reanchor(estimatedNow, now);
      return;
    }
    // 'correct': consolidar lo absorbido hasta ahora y rampear el resto.
    this.clock.startCorrection(decision.correctionMs, now);
  }

  clearRecognition(): void {
    if (
      this.overrideStatus === 'LISTENING' ||
      this.overrideStatus === 'IDENTIFYING'
    ) {
      this.overrideStatus = null;
    }
  }

  // -------------------------------------------------------------------------
  // Reloj de sincronía (delegado a SyncClock)
  // -------------------------------------------------------------------------

  /** Posición mostrada (con offset y corrección) en `at`. Público para tests/UI. */
  getDisplayedPosition(at: number = Date.now()): number {
    return this.clock.getDisplayedPosition(at);
  }

  /**
   * Re-ancla la posición actual sumando un delta (ms). Instantáneo: la letra
   * salta y el avance por reloj continúa limpio desde el nuevo punto.
   * Usado por seek (rueda del mouse) y por ajuste fino.
   */
  nudgePosition(deltaMs: number): void {
    this.pendingAnchor = null;
    this.clock.nudgePosition(deltaMs);
  }

  /**
   * Salta al boundary de línea anterior (-1) o siguiente (+1) desde la
   * posición actual. Devuelve false si no hay letras cargadas.
   */
  seekToLine(direction: -1 | 1): boolean {
    const lyrics = this.engine.getLyrics();
    if (!lyrics || lyrics.lines.length === 0) return false;
    return this.clock.seekToLine(direction, lyrics.lines.map((l) => l.start_ms));
  }

  /**
   * Reporta el nivel de audio capturado (0..1). Silencio sostenido congela el
   * reloj; cuando vuelve la señal lo reanuda desde donde quedó. Es la capa de
   * pausa "de fallback" (sin reproductor): SMTC, cuando esté, da la pausa
   * instantánea vía setPlaybackState/setExternalPosition.
   */
  reportAudioLevel(level: number, at: number = Date.now()): void {
    this.clock.reportAudioLevel(level, at);
  }

  /** Congela el reloj en la posición mostrada actual. */
  pauseClock(at: number = Date.now()): void {
    this.clock.pauseClock(at);
  }

  /** Reanuda el reloj desde la posición congelada, sin salto. */
  resumeClock(at: number = Date.now()): void {
    this.clock.resumeClock(at);
  }

  isClockPaused(): boolean {
    return this.clock.isClockPaused();
  }

  getSyncOffsetMs(): number {
    return this.clock.getSyncOffsetMs();
  }

  /** Calibración global persistida (ms, latencia AudD). */
  getCalibrationOffsetMs(): number {
    return this.clock.getCalibrationOffsetMs();
  }

  /**
   * Ajusta el offset crónico (ms) y lo persiste para la pista actual.
   * Como la posición mostrada suma syncOffsetMs en vivo, el cambio se refleja
   * solo (la letra salta `deltaMs` en el próximo tick).
   */
  adjustSyncOffset(deltaMs: number): void {
    this.clock.adjustSyncOffset(deltaMs, this.currentTrackKey);
  }

  /**
   * Ajusta la calibración global (ms) y la persiste. Como la calibración se
   * aplica al anclar cada match (va dentro del crudo), el cambio se refleja
   * en vivo desplazando la letra `deltaMs` (igual que el offset por pista) y
   * queda para los próximos matches.
   */
  adjustCalibrationOffset(deltaMs: number): void {
    this.clock.adjustCalibrationOffset(deltaMs);
  }

  /**
   * Aplica el ajuste de la pista actual a TODAS las canciones (acción manual
   * del usuario: "esto pasa siempre, no solo aquí"). Devuelve la calibración
   * global resultante.
   */
  applyOffsetToAllTracks(): number {
    return this.clock.applyOffsetToAllTracks();
  }

  // -------------------------------------------------------------------------
  // Fuente externa de posición (SMTC / reproductor del SO) — Capa b.
  //
  // El SO es la fuente de verdad del playhead: pausa/seek/skip instantáneos y
  // sin deriva. Estos métodos los llama el lector de SMTC en el proceso main.
  // AudD queda como fallback cuando no hay reproductor accesible.
  // -------------------------------------------------------------------------

  /**
   * Suprime (o rehabilita) la fuente externa SMTC. En modo micrófono con audio
   * externo al PC, `true` hace que applyExternalTrack/Position/setPlaybackState
   * sean no-op para que el reproductor del PC no pise la letra del micrófono.
   */
  setExternalInputSuppressed(suppressed: boolean): void {
    this.identity.setExternalInputSuppressed(suppressed, this.trackTitle, this.trackArtist);
  }

  /**
   * Fuente de reconocimiento activa (renderer). 'microphone' suprime SMTC por
   * completo (audio externo al PC); 'system' activa el arbitraje: AudD manda
   * en la identidad y SMTC solo aporta posición si su sesión coincide con la
   * pista actual; null (reconocimiento parado) devuelve el mando a SMTC.
   */
  setRecognitionSource(source: 'microphone' | 'system' | null): void {
    // A mode change is not evidence that the OS session belongs to the audio.
    this.identity.setRecognitionSource(source, this.trackTitle, this.trackArtist);
    this.pendingAnchor = null;
  }

  /** Pausa/reanuda el reloj según el estado de reproducción del SO. */
  setPlaybackState(playing: boolean, at: number = Date.now()): void {
    if (this.identity.externalInputSuppressed) return;
    // Sesión no confiable (es de OTRA pista): su play/pausa no aplica.
    if (!this.identity.externalTrusted) return;
    if (playing) this.clock.resumeClock(at);
    else this.clock.pauseClock(at);
  }

  /**
   * Posición de alta confianza del reproductor (SMTC): `positionMs` es el
   * playhead real en `at`. Si no suena, congela. Si suena, reconcilia:
   *   - ignora diferencias mínimas (anti-jitter, deadband);
   *   - saltos grandes (seek/skip, > DRIFT_SNAP_MS) → anclaje firme e instantáneo;
   *   - errores moderados (microsaltos de SMTC justo sobre la deadband) → se
   *     absorben con una rampa suave (igual que la deriva de AudD) en vez de un
   *     reanchor duro, para que la letra no tiemble.
   */
  applyExternalPosition(positionMs: number, playing: boolean, at: number = Date.now()): void {
    if (this.identity.externalInputSuppressed) return;
    // Prueba de vida de la sesión del SO: el sidecar manda posición cada ~1s
    // pero el título solo cuando cambia. Sin esta marca no se podría distinguir
    // "el SO sigue diciendo lo mismo" de "el SO se murió hace media hora".
    this.identity.lastExternalActivityAt = at;
    // Sesión no confiable: sus posiciones son de OTRA pista (p. ej. un video
    // de YouTube cuya metadata no coincide con lo que AudD identificó) y
    // tirarían la letra hacia cualquier parte. El reloj de pared + las
    // correcciones de AudD gobiernan hasta que la sesión vuelva a coincidir.
    if (!this.identity.externalTrusted) return;
    if (!playing) {
      this.clock.pauseClock(at);
      return;
    }
    // Defensa en profundidad contra la proyección del sidecar. La Position de
    // SMTC es un snapshot que el sidecar proyecta a "ahora"; con un navegador
    // (que solo la refresca en play/pausa/seek) esa proyección puede sumar
    // tiempo que el vídeo no reprodujo — anuncios, buffering — o venir
    // directamente del timeline de la canción ANTERIOR. Una posición más allá
    // del final de la pista es imposible y delata justo ese caso: aceptarla
    // disparaba un snap duro hacia adelante y la letra se iba corriendo.
    if (
      this.trackDurationMs != null &&
      positionMs > this.trackDurationMs + StateStore.EXTERNAL_POSITION_SLACK_MS
    ) {
      console.warn(
        `[smtc] posición ${Math.round(positionMs)}ms fuera de la pista ` +
          `(dura ${this.trackDurationMs}ms) → descartada`,
      );
      return;
    }
    if (this.clock.isClockPaused()) this.clock.resumeClock(at);
    const target = Math.max(0, positionMs) + this.clock.getSyncOffsetMs();
    const decision = computeDrift(target, this.clock.getDisplayedPosition(at));
    if (decision.action === 'ignore') return;
    console.log(`[smtc] accepted position_ms=${positionMs} at=${at} action=${decision.action}`);
    if (decision.action === 'snap') {
      this.clock.reanchor(target, at);
      return;
    }
    // 'correct': suaviza el microsalto con la misma rampa que la deriva de AudD.
    this.clock.startCorrection(decision.correctionMs, at);
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
      playing?: boolean;
    } = {},
  ): Promise<boolean> {
    // Micrófono manejando audio externo: el reproductor del PC no manda.
    if (this.identity.externalInputSuppressed) return false;
    const { album = null, durationMs = null, positionMs = 0, at = Date.now(), playing = true } = options;
    const key = normalizeTrackKey(artist, title);
    // Se registra SIEMPRE, coincida o no: es la segunda señal del arbitraje.
    // Que el SO siga diciendo la misma canción es información, no ruido.
    this.identity.lastExternalTitle = { title, artist, at };
    this.identity.lastExternalActivityAt = at;
    // Comparación tolerante: el título de video de YouTube ("Artista - Canción
    // (Official Video)" con canal como artista) y la metadata canónica de AudD
    // son la MISMA pista; sin esto, cada fuente "cambiaba" la canción de la
    // otra y la letra entraba en un loop de recarga (bug YouTube vs Spotify).
    if (this.matchesCurrentTrack(key, title, artist)) {
      // La sesión SMTC coincide con la pista en curso: vuelve a ser confiable
      // (sus posiciones y play/pausa aplican).
      this.identity.externalTrusted = true;
      this.identity.lastUnmatchedExternal = null;
      // La duración puede llegar en un evento posterior al que cargó la pista
      // (el sidecar la omite mientras su timeline sigue siendo el de la canción
      // anterior). Recogerla aquí habilita la cota de applyExternalPosition.
      if (durationMs != null && durationMs > 0) this.trackDurationMs = durationMs;
      if (this.engine.getLyrics()) {
        this.applyExternalPosition(positionMs, playing, at);
        return false;
      }
      // Misma pista sin letra: ya se buscó (o se está buscando). SMTC repite
      // el evento 'track' con frecuencia; sin este guard, cada evento
      // relanzaba la búsqueda completa contra la red. El reintento automático
      // (scheduleAutoRetry) no pasa por aquí y sigue funcionando.
      if (
        this.overrideStatus === 'NO_LYRICS' ||
        this.overrideStatus === 'ERROR' ||
        this.overrideStatus === 'FETCHING_LYRICS'
      ) {
        return false;
      }
    } else if (
      (this.identity.recognitionSource === 'system' && (this.trackTitle != null || !playing)) ||
      // A paused unrelated session cannot acquire ownership during cold start.
      // A playing session may still bootstrap the existing provisional workflow.
      (this.engine.getLyrics() && this.identity.recognitionSource != null && !isDistinctiveTitle(title))
    ) {
      // BLOQUEO DE IDENTIDAD (bug YouTube): con reconocimiento por sistema
      // activo y letra en pantalla, el fingerprint del audio es la verdad de
      // lo que SUENA. Una sesión SMTC cuya metadata no calza (título de video
      // irreconocible, otra pestaña, sesión zombie de un sidecar viejo) NO
      // recarga la letra — eso era el loop: recarga SMTC ↔ recarga AudD.
      // Se guarda para corroborar el próximo match de AudD (cambio real de
      // canción confirma rápido) y la sesión queda como NO confiable: sus
      // posiciones dejan de tirar la letra hacia otra pista.
      this.identity.externalTrusted = false;
      this.clock.releaseExternalPause();
      const isNewSignal =
        this.identity.lastUnmatchedExternal == null ||
        normalizeTrackKey(this.identity.lastUnmatchedExternal.artist, this.identity.lastUnmatchedExternal.title) !== key;
      this.identity.lastUnmatchedExternal = { title, artist, at };
      // El evento del SO es señal fiable de que ALGO cambió aunque su metadata
      // no permita saber qué: pedir una identificación por audio de inmediato
      // en vez de esperar el próximo ciclo de corrección (~18s).
      if (isNewSignal) this.requestResync(at);
      return false;
    } else if (!playing && this.engine.getLyrics() && !this.clock.isClockPaused()) {
      // Una sesión EN PAUSA no roba la letra de lo que está sonando: Windows a
      // veces parpadea la "sesión actual" entre apps (navegador ↔ Spotify) y
      // ese flip transitorio no debe recargar nada.
      return false;
    }
    // SMTC no lleva histéresis por conteo: el sidecar emite 'track' una sola
    // vez por cambio real (evento del SO, autoritativo). Exigir 2 eventos haría
    // que nunca cambiara de canción. En modo micrófono SMTC va suprimido; el
    // parpadeo espurio entre sesiones del PC es raro y se corrige al instante.
    //
    // Un título poco identificable ("Awake", "Alone") se muestra igual —mejor
    // eso que una pantalla vacía— pero queda marcado como PROVISIONAL: el
    // próximo match por audio lo reemplaza sin pasar por la histéresis.
    this.identity.currentTrackProvisional = this.identity.recognitionSource != null && !isDistinctiveTitle(title);
    if (this.identity.currentTrackProvisional) {
      console.log(
        `[identidad] título genérico del SO "${title}" ` +
          `(distintividad ${scoreTitleDistinctiveness(title).toFixed(2)}) → hint, no lock`,
      );
    }
    await this.loadLyricsByMetadata(title, artist, positionMs, at, album, durationMs);
    this.identity.externalTrusted = true;
    this.identity.lastUnmatchedExternal = null;
    if (!playing) this.clock.pauseClock(at);
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
        return this.autoRetry.isPending ? 'Sin letra aún · reintentando...' : 'Sin letra disponible';
      case 'ERROR':
        return this.autoRetry.isPending ? 'Error al buscar letra · reintentando...' : 'Error al buscar letra';
      default:
        return IDLE_MESSAGE;
    }
  }

  private buildBaseModel(status: Status, currentLine: string): RenderModel {
    const d = this.displayStore.get();
    return {
      previous_lines: [],
      current_line: { text: currentLine },
      next_lines: [],
      font_scale: d.fontScale,
      opacity: d.opacity,
      alignment: d.alignment,
      mirror_mode: d.mirrorMode,
      ...this.appearance.resolveTextAppearance(),
      ...this.appearance.resolveHandleAppearance(),
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

    const model = this.engine.getRenderModel(this.clock.getDisplayedPosition(), 'DISPLAYING');
    const full: RenderModel = {
      ...model,
      ...this.appearance.resolveTextAppearance(),
      ...this.appearance.resolveHandleAppearance(),
      track_title: this.trackTitle,
      track_artist: this.trackArtist,
      position_ms: Math.round(this.clock.getDisplayedPosition()),
    };
    this.emit(full);
  }

  private emit(model: RenderModel): void {
    this.lastModel = model;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('render:model', model);
    }
  }
}
