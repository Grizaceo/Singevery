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
  repeatPeriodsMs,
  DRIFT_SNAP_MS,
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
import { isAuddTokenInvalid } from '../services/recognition/auddProvider';
import { NULL_OFFSET_STORE, NULL_CALIBRATION_STORE, NULL_DISPLAY_STORE, NULL_TRANSLATION_STORE, NULL_READING_STORE } from '../services/settings';
import type { OffsetStore, CalibrationStore, DisplayStore, TranslationStore, ReadingStore } from '../services/settings';
import { translateLines, localTranslationEngineKey } from '../services/translate';
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
    /** Hold manual activo: el usuario movió la letra y el auto solo observa. */
    manualHold: boolean;
    holdReason: 'seekLine' | 'nudge' | null;
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

  private pendingAnchor: {
    key: string | null;
    position: number;
    at: number;
    sampleAt: number;
    /** Anclas coherentes ADICIONALES necesarias para aplicar el snap. */
    needed: number;
    /** Anclas coherentes consecutivas ya vistas (sin contar la pendiente). */
    seen: number;
  } | null = null;

  /** Holgura al comparar una posición externa con la duración de la pista: las
   *  duraciones de SMTC y del reconocedor no coinciden al segundo. */
  private static readonly EXTERNAL_POSITION_SLACK_MS = 5_000;

  // ---- Cuarentena de posiciones externas (SMTC/MPRIS) ---------------------
  // La posición del reproductor del SO es casi siempre la verdad, pero hay
  // fuentes que alternan valores imposibles (un navegador que reporta el
  // timeline de la pista anterior, un sidecar con proyección rota: 0,1000,0,
  // 1000…). Aceptarlas tal cual producía un snap por muestra y la letra
  // saltaba sin parar. Regla: un retroceso > EXTERNAL_BACKWARD_QUARANTINE_MS
  // respecto a la última posición aceptada proyectada, o un salto adelante
  // > DRIFT_SNAP_MS, NO se aplica de inmediato: queda pendiente y solo se
  // aplica si las muestras siguientes la confirman (ver applyExternalPosition).

  /** Última posición externa ACEPTADA (cruda, con su instante y fuente).
   *  Se reinicia en cada cambio de pista (externo o por identidad). */
  private lastExternalAccepted: { positionMs: number; at: number; source: string } | null = null;
  /** Posición externa en cuarentena a la espera de confirmación. */
  private pendingExternalPosition: {
    positionMs: number;
    at: number;
    source: string;
    kind: 'retroceso' | 'salto';
    /** Posiciones coherentes consecutivas que faltan para aplicarla. */
    needed: number;
    seen: number;
  } | null = null;
  /** Retroceso (ms) que ya no es jitter: exige confirmación antes de aplicar. */
  private static readonly EXTERNAL_BACKWARD_QUARANTINE_MS = 1_500;
  /** Las confirmaciones deben llegar todas dentro de esta ventana. */
  private static readonly EXTERNAL_QUARANTINE_CONFIRM_MS = 5_000;
  /** Tolerancia (ms) para considerar coherente una muestra con la pendiente. */
  private static readonly EXTERNAL_QUARANTINE_TOLERANCE_MS = 1_000;
  /** Tras un evento de pista nuevo, las posiciones de arranque pasan directo. */
  private static readonly EXTERNAL_TRACK_START_GRACE_MS = 3_000;
  /** Instante del último evento de pista externo NUEVO (cambio real de clave). */
  private lastExternalTrackEventAt = Number.NEGATIVE_INFINITY;
  /** Clave del último evento 'track' externo registrado (dedupe del log 1c). */
  private lastExternalEventKey: string | null = null;

  // ---- Pistas rechazadas por el usuario (botón "✗ No es esta") -----------
  // Cuando el usuario dice que la canción mostrada no es la que suena, su
  // clave queda vetada: los próximos matches con esa clave se ignoran (el
  // reconocedor la tiene fichada y la repetiría en bucle). La veto dura
  // hasta que se confirme OTRA pista o pasados 10 min — si el usuario se
  // equivocó de botón, la canción puede volver a identificarse luego.
  private rejectedKeys = new Map<string, number>();
  /** Vigencia de un veto (ms). */
  private static readonly REJECTED_KEY_TTL_MS = 10 * 60_000;
  /** Un título del reproductor más viejo que esto ya no es "segunda opinión". */
  private static readonly EXTERNAL_TITLE_FRESH_MS = 60_000;

  /** Períodos de repetición de la letra actual (ver repeatPeriodsMs), calculados
   *  una sola vez por letra cargada. */
  private repeatPeriodsCache: { lyrics: TimedLyrics; periods: number[] } | null = null;
  /** Un snap con |error| mayor que esto exige 3 anclas coherentes (no 2). */
  private static readonly SUSPICIOUS_SNAP_ERROR_MS = 20_000;
  /** Tolerancia (ms) para considerar que un error "cae" en un período de
   *  repetición de la letra (o en su doble). */
  private static readonly REPEAT_PERIOD_TOLERANCE_MS = 1_000;

  /** Pide al renderer re-identificar YA (cambio de pista no confirmable). */
  private resyncRequester: (() => void) | null = null;
  /** -Infinity y no 0: con 0 la primera petición quedaba dentro del throttle. */
  private lastResyncRequestAt = Number.NEGATIVE_INFINITY;
  /** Mínimo entre peticiones de resync: un ciclo de captura completo. */
  private static readonly RESYNC_THROTTLE_MS = 10_000;

  // ---- Hold manual de sincronía ------------------------------------------
  // Mientras el usuario mueve la letra a mano (◀/▶ del panel ⇄ → seekToLine,
  // o la rueda sobre la barra inferior → nudgePosition), NINGUNA fuente
  // automática puede re-anclar ni iniciar corrección: la posición mostrada es
  // decisión suya. Las fuentes siguen midiendo y dejan su última sugerencia,
  // que resumeAutoSync() aplica al pulsar "Sincronizar" (o se descarta al
  // cambiar de pista/letra). La pausa/reanudación del reloj NO se toca:
  // congelar no cambia de línea y el usuario sigue queriendo que pause/play
  // del SO o del silencio funcionen.
  private manualHold: { since: number; reason: 'seekLine' | 'nudge' } | null = null;
  /** Última posición propuesta por una fuente automática durante el hold, en
   *  espacio "mostrado" (ya incluye el offset crónico). */
  private lastAutoSuggestion: { positionMs: number; at: number; source: string } | null = null;
  /** Una sugerencia más vieja que esto ya no representa dónde va la canción. */
  private static readonly HOLD_SUGGESTION_TTL_MS = 30_000;

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
        manualHold: this.manualHold != null,
        holdReason: this.manualHold?.reason ?? null,
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
    // Letra limpiada (sin resultado o error de búsqueda): el hold manual ya
    // no tiene sentido — no queda línea que el usuario haya querido fijar.
    if (lyrics == null) this.releaseManualHold('sin-letra');
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
    // Letra elegida a mano = pista confirmada por el usuario: levanta vetos.
    this.rejectedKeys.clear();
    // La eligió el usuario: es la verdad, no un hint.
    this.identity.currentTrackProvisional = false;
    this.currentTrackKey = trackKey;
    this.lastMatchKey = trackKey;
    // Letra elegida a mano: no sabemos a qué grabación corresponde, así que no
    // hay duración de referencia contra la que acotar posiciones externas.
    this.trackDurationMs = null;
    this.resetExternalPositionState();
    // Letra elegida a mano = identidad nueva: la selección manual anterior
    // (si la había) era de otra canción y no aplica a esta.
    this.releaseManualHold('letra importada');
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
    const translationEngineKey = localTranslationEngineKey(config);
    const alreadyDone =
      lyrics.translationLang === targetLang &&
      lyrics.translationEngineKey === translationEngineKey &&
      lyrics.lines.every((l) => l.translation != null);
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
      translationEngineKey,
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
    options: { keepRejectedKeys?: boolean } = {},
  ): Promise<void> {
    const trackKey = normalizeTrackKey(artist, title);
    const isNewTrack = trackKey !== this.currentTrackKey;
    // Identidad nueva: limpiar aliases y contador de reintentos de la anterior.
    if (isNewTrack) {
      this.trackAliasKeys.clear();
      this.autoRetry.reset();
      // Pista distinta = la desalineación anterior ya no aplica.
      this.identity.mismatchResyncs = 0;
      // Y la cuarentena de posiciones externas también: la línea de tiempo
      // del reproductor acaba de cambiar, la historia anterior no aplica.
      this.resetExternalPositionState();
      // Cambio de pista/letra: la selección manual era de la canción
      // anterior y no tiene sentido arrastrarla a la nueva.
      this.releaseManualHold('cambio de pista');
      // Confirmar OTRA pista levanta los vetos del usuario ("No es esta"):
      // ya no estamos en la canción que rechazó. La única excepción es la
      // segunda opinión que dispara el propio rejectCurrentTrack, que no
      // debe borrar el veto que acaba de poner.
      if (!options.keepRejectedKeys) this.rejectedKeys.clear();
      this.repeatPeriodsCache = null;
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

  /**
   * Reinicia la memoria de posiciones externas (última aceptada + cuarentena)
   * en cada cambio de pista, sea por evento del SO o por reconocimiento.
   * Sin ella, una posición de la pista nueva se compararía contra la proyección
   * de la anterior y nacería en cuarentena (o peor, en un snap falso).
   */
  private resetExternalPositionState(): void {
    this.lastExternalAccepted = null;
    this.pendingExternalPosition = null;
  }

  // -------------------------------------------------------------------------
  // Hold manual de sincronía
  // -------------------------------------------------------------------------

  /**
   * Activa el hold manual. Solo lo llaman seekToLine y nudgePosition: los
   * ajustes de offset/calibración NO activan hold porque son correcciones
   * persistentes ("esto pasa siempre"), no una selección de línea puntual.
   */
  private activateManualHold(reason: 'seekLine' | 'nudge', at: number = Date.now()): void {
    this.manualHold = { since: at, reason };
    // Las corroboraciones pendientes quedaron de la posición anterior: el
    // usuario ya movió la letra a mano, ya no aplican.
    this.pendingAnchor = null;
    this.pendingExternalPosition = null;
    console.log(`[manual] hold activado (${reason})`);
  }

  /** Libera el hold por causas ajenas a "Sincronizar" (pista/letra nueva). */
  private releaseManualHold(reason: string, at: number = Date.now()): void {
    if (!this.manualHold) return;
    const durS = ((at - this.manualHold.since) / 1000).toFixed(1);
    this.manualHold = null;
    this.lastAutoSuggestion = null;
    console.log(`[manual] hold liberado (${reason}) tras ${durS} s`);
  }

  /**
   * "Sincronizar" (IPC sync:resume): libera el hold manual y devuelve el mando
   * a las fuentes automáticas. Si quedó una sugerencia de hace <30 s se
   * proyecta al ahora (sin avanzar si el reloj está pausado) y se aplica con
   * la misma decisión que computeDrift: snap → reanchor directo, correct →
   * rampa suave, ignore → nada. Además pide una re-identificación para traer
   * un ancla fresco cuanto antes.
   */
  resumeAutoSync(at: number = Date.now()): void {
    const hold = this.manualHold;
    const suggestion = this.lastAutoSuggestion;
    this.manualHold = null;
    this.lastAutoSuggestion = null;

    let accion = 'ninguna';
    let errorMs = 0;
    if (suggestion && at - suggestion.at <= StateStore.HOLD_SUGGESTION_TTL_MS) {
      const projected =
        suggestion.positionMs +
        (this.clock.isClockPaused() ? 0 : Math.max(0, at - suggestion.at));
      const decision = computeDrift(projected, this.clock.getDisplayedPosition(at));
      errorMs = decision.errorMs;
      if (decision.action === 'snap') {
        this.clock.reanchor(projected, at);
        accion = 'snap';
      } else if (decision.action === 'correct') {
        this.clock.startCorrection(decision.correctionMs, at);
        accion = 'rampa';
      } else {
        accion = 'ignore';
      }
    }
    this.requestResync(at);
    const durS = hold ? ((at - hold.since) / 1000).toFixed(1) : '0.0';
    console.log(
      `[manual] sincronizar: liberado hold (${hold?.reason ?? 'sin-hold'}, ${durS} s), ` +
        `aplicado ${accion} error=${Math.round(errorMs)}ms`,
    );
  }

  /**
   * Campos del RenderModel sobre el hold manual y la sincronía de la letra.
   * `sync_hold_drift_ms` = sugerencia automática proyectada a `at` menos la
   * posición mostrada; null si el hold está inactivo o la sugerencia ya es
   * vieja (>30 s). `lyrics_synced` es false solo cuando la letra cargada es
   * PLANA (synced:false): una entrada vieja de caché sin el campo cuenta como
   * sincronizada para no alarmar de más.
   */
  private syncModelFields(
    at: number,
  ): Pick<RenderModel, 'sync_hold' | 'sync_hold_drift_ms' | 'lyrics_synced'> {
    const lyrics = this.engine.getLyrics();
    const suggestion = this.lastAutoSuggestion;
    let driftMs: number | null = null;
    if (
      this.manualHold &&
      suggestion &&
      at - suggestion.at <= StateStore.HOLD_SUGGESTION_TTL_MS
    ) {
      const projected =
        suggestion.positionMs +
        (this.clock.isClockPaused() ? 0 : Math.max(0, at - suggestion.at));
      driftMs = Math.round(projected - this.clock.getDisplayedPosition(at));
    }
    return {
      sync_hold: this.manualHold != null,
      sync_hold_drift_ms: driftMs,
      lyrics_synced: lyrics != null && lyrics.synced !== false,
    };
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

  // -------------------------------------------------------------------------
  // Pista rechazada por el usuario ("✗ No es esta")
  // -------------------------------------------------------------------------

  /** ¿La clave está vetada por el usuario y el veto sigue vigente? */
  private isKeyRejected(key: string, at: number = Date.now()): boolean {
    const rejectedAt = this.rejectedKeys.get(key);
    if (rejectedAt == null) return false;
    if (at - rejectedAt >= StateStore.REJECTED_KEY_TTL_MS) {
      this.rejectedKeys.delete(key);
      return false;
    }
    return true;
  }

  /**
   * El usuario señaló que la canción mostrada NO es la que suena. Efectos:
   *   - la clave actual queda vetada (applyMatch y applyExternalTrack la
   *     ignoran) hasta que se confirme otra pista o pasen 10 min;
   *   - la letra se retira sin tocar offset ni calibración: el estado queda
   *     como "buscando" (FETCHING_LYRICS) a la espera de la re-identificación
   *     que el handler de feedback dispara justo después;
   *   - segunda opinión independiente: si el reproductor del SO reportó hace
   *     <60 s un título distinto y no vetado, se carga SU letra como pista
   *     provisional — el metadato del SO no depende del reconocedor que falló.
   */
  async rejectCurrentTrack(at: number = Date.now()): Promise<void> {
    const rejectedKey = this.currentTrackKey;
    if (!rejectedKey) return;
    this.rejectedKeys.set(rejectedKey, at);
    this.pendingAnchor = null;
    // Un reintento automático en vuelo recargaría la letra vetada.
    this.autoRetry.cancel();

    const ext = this.identity.lastExternalTitle;
    let secondOpinion: { title: string; artist: string } | null = null;
    if (ext && at - ext.at < StateStore.EXTERNAL_TITLE_FRESH_MS) {
      const extKey = normalizeTrackKey(ext.artist, ext.title);
      if (extKey !== rejectedKey && !this.isKeyRejected(extKey, at)) {
        secondOpinion = { title: ext.title, artist: ext.artist };
      }
    }

    // Retira la letra mostrada conservando offset/calibración del reloj.
    this.setLyrics(null, this.trackTitle, this.trackArtist);
    this.overrideStatus = 'FETCHING_LYRICS';

    if (!secondOpinion) {
      console.log(
        `[identidad] rechazada por el usuario: "${rejectedKey}" → espera nueva identificación`,
      );
      return;
    }
    console.log(
      `[identidad] rechazada por el usuario: "${rejectedKey}" → ` +
        `usa título del reproductor "${secondOpinion.title}"`,
    );
    // Segunda opinión = identidad provisional: el próximo match por audio la
    // confirma o la reemplaza sin gastar la histéresis completa.
    this.identity.currentTrackProvisional = this.identity.recognitionSource != null;
    // Ancla con la última posición externa aceptada (el playhead real del
    // reproductor) para no empezar la letra nueva desde cero.
    const anchorMs = this.lastExternalAccepted
      ? Math.max(
          0,
          this.lastExternalAccepted.positionMs + Math.max(0, at - this.lastExternalAccepted.at),
        )
      : 0;
    try {
      await this.loadLyricsByMetadata(
        secondOpinion.title,
        secondOpinion.artist,
        anchorMs,
        at,
        null,
        null,
        { keepRejectedKeys: true },
      );
    } catch (err) {
      console.warn('[identidad] la segunda opinión no pudo cargar letra:', err);
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

    // El usuario vetó esta canción ("No es esta"): el reconocedor la tiene
    // fichada y la repetiría en bucle; se ignora hasta que venza el veto.
    if (this.isKeyRejected(matchKey)) {
      console.log(`[identidad] match descartado: "${matchKey}" rechazado por el usuario`);
      return false;
    }

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
      !this.identity.confirmTrackChange(
        matchKey,
        Boolean(this.engine.getLyrics()),
        this.trackTitle,
        this.trackArtist,
        match.position_ms,
        this.currentTrackKey,
      )
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
    // Trazabilidad del cambio: dos fuentes (sistema/corte de audio) o el
    // motivo que dio el árbitro (sin-letra/provisional/histéresis/insistencia).
    const motivo = corroboratedByOs
      ? 'sistema'
      : corroboratedByAudio
        ? 'corte-de-audio'
        : (this.identity.lastDecisionReason ?? 'histéresis');
    console.log(`[identidad] cambio a "${matchKey}" motivo=${motivo}`);
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
    } else if (this.manualHold) {
      // Hold manual: la corrección por energía también es una fuente
      // automática — se mide (queda en /debug) pero no se aplica.
      measurement.skipped = 'selección manual (hold)';
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
      trackKey: this.currentTrackKey, matchTitle: match.track.title, matchArtist: match.track.artist,
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

    // Hold manual: el usuario fijó la posición; el ancla de reconocimiento
    // solo queda como sugerencia (la aplicará "Sincronizar" si sigue fresca).
    // Sin reanchor, sin rampa y sin requestResync por snap.
    if (this.manualHold) {
      this.lastAutoSuggestion = {
        positionMs: estimatedNow,
        at: now,
        source: match.track.provider,
      };
      console.log(`[sync] hold: error=${Math.round(decision.errorMs)}ms (no se aplica)`);
      return;
    }

    if (decision.action !== 'snap') this.pendingAnchor = null;
    if (decision.action === 'ignore') return;
    if (decision.action === 'snap') {
      const sampleAt = recordStartedAt ?? match.matched_at;
      const pending = this.pendingAnchor;
      if (pending && sampleAt <= pending.sampleAt) return;
      const pendingValid =
        pending != null &&
        pending.key === this.currentTrackKey &&
        now - pending.at <= this.identity.externalCorroborationTtlMs;
      if (pendingValid) {
        const coherent =
          computeDrift(estimatedNow, pending.position + Math.max(0, now - pending.at)).action !==
          'snap';
        if (coherent) {
          pending.seen += 1;
          if (pending.seen >= pending.needed) {
            // Confirmada por anclas coherentes suficientes: era un seek real.
            this.pendingAnchor = null;
            console.log(`[sync] corroborated seek position_ms=${estimatedNow}`);
            this.clock.reanchor(estimatedNow, now);
          } else {
            console.log(
              `[sync] quarantined position_ms=${estimatedNow} ` +
                `(${pending.seen + 1}/${pending.needed + 1} anclas)`,
            );
          }
          return;
        }
        // Ancla incoherente con la pendiente: la descarta y esta abre una
        // cuarentena nueva (cae al bloque de abajo).
      }
      // Snap sospechoso: error gigante o que cae en un período de repetición
      // de la letra (secciones que vuelven cada N segundos — caso real:
      // "Crack a Bottle" con estribillo cada 72,8 s). Exige 3 anclas
      // coherentes en total en vez de 2.
      const absError = Math.abs(decision.errorMs);
      const repeatPeriod = this.matchRepeatPeriod(absError);
      const suspicious = absError > StateStore.SUSPICIOUS_SNAP_ERROR_MS || repeatPeriod != null;
      this.pendingAnchor = {
        key: this.currentTrackKey,
        position: estimatedNow,
        at: now,
        sampleAt,
        needed: suspicious ? 2 : 1,
        seen: 0,
      };
      console.log(
        `[sync] quarantined position_ms=${estimatedNow} sample_at=${sampleAt}` +
          (suspicious ? ' (sospechoso: requiere 3 anclas)' : ''),
      );
      this.requestResync(now);
      return;
    }
    // 'correct': consolidar lo absorbido hasta ahora y rampear el resto.
    this.clock.startCorrection(decision.correctionMs, now);
  }

  /** Períodos de repetición de la letra en pantalla (solo si es sincronizada).
   *  Se calculan una vez por letra: el resultado se cachea por identidad del
   *  objeto TimedLyrics y se invalida al cargar otra. */
  private getRepeatPeriodsMs(): number[] {
    const lyrics = this.engine.getLyrics();
    if (!lyrics || lyrics.synced === false) return [];
    if (this.repeatPeriodsCache?.lyrics !== lyrics) {
      this.repeatPeriodsCache = { lyrics, periods: repeatPeriodsMs(lyrics.lines) };
    }
    return this.repeatPeriodsCache.periods;
  }

  /**
   * ¿El error absoluto de un snap coincide (±1 s) con un período de
   * repetición de la letra o con su doble? Devuelve el período base en ms, o
   * null. Un salto de exactamente un estribillo es la firma típica de una
   * sección repetida, no de un seek del usuario.
   */
  private matchRepeatPeriod(absErrorMs: number): number | null {
    for (const period of this.getRepeatPeriodsMs()) {
      if (
        Math.abs(absErrorMs - period) <= StateStore.REPEAT_PERIOD_TOLERANCE_MS ||
        Math.abs(absErrorMs - 2 * period) <= StateStore.REPEAT_PERIOD_TOLERANCE_MS
      ) {
        console.log(
          `[sync] salto sospechoso: error=${Math.round(absErrorMs)}ms ` +
            `coincide con repetición de ${(period / 1000).toFixed(1)} s`,
        );
        return period;
      }
    }
    return null;
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
    const before = this.clock.getDisplayedPosition();
    this.pendingAnchor = null;
    this.clock.nudgePosition(deltaMs);
    this.activateManualHold('nudge');
    console.log(
      `[manual] nudge delta=${deltaMs}ms antes=${Math.round(before)} ` +
        `después=${Math.round(this.clock.getDisplayedPosition())}`,
    );
  }

  /**
   * Salta al boundary de línea anterior (-1) o siguiente (+1) desde la
   * posición actual. Devuelve false si no hay letras cargadas.
   */
  seekToLine(direction: -1 | 1): boolean {
    const lyrics = this.engine.getLyrics();
    if (!lyrics || lyrics.lines.length === 0) return false;
    const before = this.clock.getDisplayedPosition();
    const moved = this.clock.seekToLine(direction, lyrics.lines.map((l) => l.start_ms));
    if (moved) {
      this.activateManualHold('seekLine');
      console.log(
        `[manual] seek-line direction=${direction} antes=${Math.round(before)} ` +
          `después=${Math.round(this.clock.getDisplayedPosition())}`,
      );
    }
    return moved;
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
    console.log(`[manual] sync-offset delta=${deltaMs}ms offset=${this.clock.getSyncOffsetMs()}ms`);
  }

  /**
   * Ajusta la calibración global (ms) y la persiste. Como la calibración se
   * aplica al anclar cada match (va dentro del crudo), el cambio se refleja
   * en vivo desplazando la letra `deltaMs` (igual que el offset por pista) y
   * queda para los próximos matches.
   */
  adjustCalibrationOffset(deltaMs: number): void {
    this.clock.adjustCalibrationOffset(deltaMs);
    console.log(
      `[manual] calibration delta=${deltaMs}ms calibration=${this.clock.getCalibrationOffsetMs()}ms`,
    );
  }

  /**
   * Aplica el ajuste de la pista actual a TODAS las canciones (acción manual
   * del usuario: "esto pasa siempre, no solo aquí"). Devuelve la calibración
   * global resultante.
   */
  applyOffsetToAllTracks(): number {
    const calibration = this.clock.applyOffsetToAllTracks();
    console.log(`[manual] offset-a-todas calibration=${calibration}ms`);
    return calibration;
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
   * Posición de alta confianza del reproductor (SMTC/MPRIS): `positionMs` es el
   * playhead real en `at`. Si no suena, congela. Si suena, reconcilia:
   *   - ignora diferencias mínimas (anti-jitter, deadband);
   *   - retrocesos > EXTERNAL_BACKWARD_QUARANTINE_MS o saltos adelante
   *     > DRIFT_SNAP_MS respecto a la última posición aceptada → CUARENTENA:
   *     no se aplican hasta que las muestras siguientes las confirmen
   *     (ver abajo); una fuente que alterna 0/1000 ya no puede mover la letra;
   *   - errores moderados (microsaltos de SMTC justo sobre la deadband) → se
   *     absorben con una rampa suave (igual que la deriva de AudD) en vez de un
   *     reanchor duro, para que la letra no tiemble.
   * `source` identifica al reproductor ('smtc', 'mpris:spotify', …) para logs.
   */
  applyExternalPosition(
    positionMs: number,
    playing: boolean,
    at: number = Date.now(),
    source = 'smtc',
  ): void {
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

    // Hold manual: la posición externa NO re-ancla ni corrige; queda como
    // sugerencia (la aplicará "Sincronizar" si sigue fresca). Sí se registra
    // como última aceptada: es la línea base más reciente de la fuente, así
    // la cuarentena retoma la comparación correcta al liberar el hold.
    if (this.manualHold) {
      const target = Math.max(0, positionMs) + this.clock.getSyncOffsetMs();
      this.lastAutoSuggestion = { positionMs: target, at, source };
      this.lastExternalAccepted = { positionMs, at, source };
      console.log(
        `[sync] hold: error=${Math.round(target - this.clock.getDisplayedPosition(at))}ms ` +
          `(no se aplica) fuente=${source}`,
      );
      return;
    }

    // ---- Cuarentena de saltos externos ------------------------------------
    // La comparación NO es contra la letra mostrada sino contra la última
    // posición externa aceptada proyectada a `at`: es la única línea de tiempo
    // que la fuente externa afirma, y detecta la oscilación 0/1000 aunque la
    // letra esté desfasada por otro motivo.
    // Excepción de arranque: los primeros 3 s tras un evento de pista nuevo se
    // aceptan tal cual (el reproductor está reportando el inicio de la pista;
    // una "retroceso" ahí es el punto de partida, no una mentira).
    const inTrackStartGrace =
      at - this.lastExternalTrackEventAt <= StateStore.EXTERNAL_TRACK_START_GRACE_MS;
    const accepted = this.lastExternalAccepted;
    if (!inTrackStartGrace && accepted != null) {
      const projected = accepted.positionMs + Math.max(0, at - accepted.at);
      const pending = this.pendingExternalPosition;
      if (pending != null) {
        // ¿La muestra nueva es coherente con la posición en cuarentena?
        // Se proyecta igual que la aceptada (avanza con el reloj de pared).
        const pendingProjected = pending.positionMs + Math.max(0, at - pending.at);
        const coherent =
          Math.abs(positionMs - pendingProjected) <= StateStore.EXTERNAL_QUARANTINE_TOLERANCE_MS;
        const expired = at - pending.at > StateStore.EXTERNAL_QUARANTINE_CONFIRM_MS;
        if (!coherent || expired) {
          console.log(
            `[smtc] posición descartada (${pending.kind} sin confirmar) ` +
              `position_ms=${Math.round(positionMs)} pendiente=${Math.round(pending.positionMs)} ` +
              `proyectada=${Math.round(pendingProjected)} fuente=${pending.source}`,
          );
          this.pendingExternalPosition = null;
          // La muestra actual se reclasifica abajo contra la última aceptada:
          // puede ser coherente con la pista real y aplicarse normal, o iniciar
          // una cuarentena nueva si también es un salto.
        } else {
          pending.seen += 1;
          if (pending.seen >= pending.needed) {
            // Confirmada por muestras consecutivas coherentes: era un seek real.
            this.pendingExternalPosition = null;
            this.lastExternalAccepted = { positionMs, at, source };
            this.clock.reanchor(Math.max(0, positionMs) + this.clock.getSyncOffsetMs(), at);
            console.log(
              `[smtc] accepted position_ms=${positionMs} at=${at} action=snap ` +
                `fuente=${source} (confirmada tras cuarentena)`,
            );
            return;
          }
          // Aún falta una muestra: la letra no se mueve.
          return;
        }
      }
      if (this.pendingExternalPosition == null) {
        const delta = positionMs - projected;
        if (delta < -StateStore.EXTERNAL_BACKWARD_QUARANTINE_MS) {
          // Retroceso: exige 2 posiciones coherentes más en <5 s.
          this.pendingExternalPosition = {
            positionMs,
            at,
            source,
            kind: 'retroceso',
            needed: 2,
            seen: 0,
          };
          console.log(
            `[smtc] posición en cuarentena (retroceso) position_ms=${Math.round(positionMs)} ` +
              `proyectada=${Math.round(projected)} fuente=${source}`,
          );
          return;
        }
        if (delta > DRIFT_SNAP_MS) {
          // Salto adelante: basta 1 posición coherente siguiente.
          this.pendingExternalPosition = {
            positionMs,
            at,
            source,
            kind: 'salto',
            needed: 1,
            seen: 0,
          };
          console.log(
            `[smtc] posición en cuarentena (salto) position_ms=${Math.round(positionMs)} ` +
              `proyectada=${Math.round(projected)} fuente=${source}`,
          );
          return;
        }
      }
    }

    const target = Math.max(0, positionMs) + this.clock.getSyncOffsetMs();
    const decision = computeDrift(target, this.clock.getDisplayedPosition(at));
    if (decision.action === 'ignore') {
      this.lastExternalAccepted = { positionMs, at, source };
      return;
    }
    console.log(
      `[smtc] accepted position_ms=${positionMs} at=${at} action=${decision.action} fuente=${source}`,
    );
    this.lastExternalAccepted = { positionMs, at, source };
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
      /** Origen del evento ('smtc', 'mpris:spotify', …) para observabilidad. */
      source?: string;
    } = {},
  ): Promise<boolean> {
    // Micrófono manejando audio externo: el reproductor del PC no manda.
    if (this.identity.externalInputSuppressed) return false;
    const {
      album = null,
      durationMs = null,
      positionMs = 0,
      at = Date.now(),
      playing = true,
      source = 'smtc',
    } = options;
    const key = normalizeTrackKey(artist, title);
    // Log de eventos de pista (1c): solo cuando la clave difiere de la del
    // último evento registrado — el sidecar/MPRIS repite 'track' en cada poll
    // y loguear cada uno ahogaría la señal.
    const esNuevoEvento = key !== this.lastExternalEventKey;
    this.lastExternalEventKey = key;
    const logPistaExterna = (decision: string): void => {
      if (!esNuevoEvento) return;
      console.log(
        `[smtc] pista externa title="${title}" artist="${artist}" ` +
          `fuente=${source} decisión=${decision}`,
      );
    };
    // Se registra SIEMPRE, coincida o no: es la segunda señal del arbitraje.
    // Que el SO siga diciendo la misma canción es información, no ruido.
    this.identity.lastExternalTitle = { title, artist, at };
    this.identity.lastExternalActivityAt = at;
    // El usuario vetó esta canción ("No es esta"): ni el SO puede recargarla.
    if (this.isKeyRejected(key, at)) {
      logPistaExterna('rechazada-usuario');
      return false;
    }
    // Comparación tolerante: el título de video de YouTube ("Artista - Canción
    // (Official Video)" con canal como artista) y la metadata canónica de AudD
    // son la MISMA pista; sin esto, cada fuente "cambiaba" la canción de la
    // otra y la letra entraba en un loop de recarga (bug YouTube vs Spotify).
    if (this.matchesCurrentTrack(key, title, artist)) {
      logPistaExterna('coincide');
      // La sesión SMTC coincide con la pista en curso: vuelve a ser confiable
      // (sus posiciones y play/pausa aplican).
      this.identity.externalTrusted = true;
      this.identity.lastUnmatchedExternal = null;
      // La duración puede llegar en un evento posterior al que cargó la pista
      // (el sidecar la omite mientras su timeline sigue siendo el de la canción
      // anterior). Recogerla aquí habilita la cota de applyExternalPosition.
      if (durationMs != null && durationMs > 0) this.trackDurationMs = durationMs;
      if (this.engine.getLyrics()) {
        this.applyExternalPosition(positionMs, playing, at, source);
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
      logPistaExterna('bloqueada');
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
      logPistaExterna('en-pausa-ignorada');
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
    logPistaExterna('nueva');
    // Cambio de pista real: abre la ventana de gracia para las posiciones de
    // arranque y deja la posición del evento como línea base del historial
    // (loadLyricsByMetadata ya reinició la cuarentena por ser pista nueva).
    this.lastExternalTrackEventAt = at;
    await this.loadLyricsByMetadata(title, artist, positionMs, at, album, durationMs);
    // Línea base solo si la pista cargada sigue siendo la del evento (otra
    // fuente pudo cambiarla mientras tanto).
    if (this.currentTrackKey === key) {
      this.lastExternalAccepted = { positionMs, at, source };
    }
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
      ...this.syncModelFields(Date.now()),
      recognition_warning: isAuddTokenInvalid() ? 'audd_invalid_token' : null,
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

    const now = Date.now();
    const displayed = this.clock.getDisplayedPosition(now);
    const model = this.engine.getRenderModel(displayed, 'DISPLAYING');
    const full: RenderModel = {
      ...model,
      ...this.appearance.resolveTextAppearance(),
      ...this.appearance.resolveHandleAppearance(),
      track_title: this.trackTitle,
      track_artist: this.trackArtist,
      position_ms: Math.round(displayed),
      ...this.syncModelFields(now),
      recognition_warning: isAuddTokenInvalid() ? 'audd_invalid_token' : null,
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
