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
import { isColorDark } from './colorUtils';
import {
  adjustMatchPosition,
  projectAnchoredPosition,
  computeDrift,
  normalizeTrackKey,
} from './syncTiming';
import type { RecognitionPhase } from './syncTiming';
import { looksLikeSameTrack } from '../services/lyrics/normalizeQuery';
import { isDistinctiveTitle, scoreTitleDistinctiveness } from '../services/lyrics/titleDistinctiveness';
import { LyricsService, defaultLyricsService } from '../services/lyrics/lyricsService';
import { NULL_OFFSET_STORE, NULL_CALIBRATION_STORE, NULL_DISPLAY_STORE, NULL_TRANSLATION_STORE, NULL_READING_STORE } from '../services/settings';
import type { OffsetStore, CalibrationStore, DisplayStore, TranslationStore, ReadingStore } from '../services/settings';
import { setPinyinToneType } from '../services/romanize';
import { translateLines } from '../services/translate';
import type { RenderModel, Status, TimedLyrics, TrackMatch } from '../../src/types';

export type { RecognitionPhase };

const IDLE_MESSAGE = 'Esperando música...';

/**
 * Insistencia del reconocimiento por audio en una canción distinta a la que se
 * muestra. `titleStillSays` guarda qué seguía diciendo el título del SO cuando
 * empezó la racha: si el SO nunca cambió, el audio está solo y necesita muchas
 * más confirmaciones para romper el lock.
 */
export interface WrongSongStrikes {
  songIdentified: string;
  consecutiveHits: number;
  titleStillSays: string;
}

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
  };
  sync: {
    displayedPositionMs: number;
    offsetMs: number;
    calibrationOffsetMs: number;
    paused: boolean;
  };
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

  private overrideStatus: Status | null = null;
  private lastMatchKey: string | null = null;
  private currentTrackKey: string | null = null;

  // Histéresis de cambio de canción. El loop de corrección re-identifica con el
  // micrófono cada ~18s; una mis-identificación puntual (ruido, versión/remaster
  // con título que normaliza distinto) NO debe arrancar la letra que ya se está
  // mostrando. Sólo cambiamos cuando la MISMA pista nueva se confirma en varios
  // ciclos consecutivos.
  private readonly CHANGE_CONFIRM_COUNT = 2;

  // Cuántas veces seguidas debe insistir el audio para romper el lock cuando el
  // SISTEMA OPERATIVO lo contradice (su sesión sigue diciendo la canción
  // actual). Ahí solo hay UNA señal de cambio y las señales están en conflicto:
  // se le da mucho más margen antes de hacerle caso. Si además el título del SO
  // cambia, son dos señales independientes y basta CHANGE_CONFIRM_COUNT.
  private readonly WRONG_SONG_STRIKE_LIMIT = 5;

  /** Insistencia del reconocedor en una pista distinta a la que se muestra. */
  private wrongSong: WrongSongStrikes | null = null;

  /** Última pista que reportó el SO (haya coincidido o no con la actual). */
  private lastExternalTitle: { title: string; artist: string; at: number } | null = null;
  /** Último evento del SO de cualquier tipo: prueba de que la sesión vive. */
  private lastExternalActivityAt = 0;
  /** Sin señal del SO en este lapso, su último título ya no dice nada. */
  private static readonly EXTERNAL_LIVENESS_MS = 30_000;

  // Pista PROVISIONAL: entró por un título del SO poco identificable ("Awake",
  // "Alone", "Lucky Star" — ver titleDistinctiveness). Sirve para mostrar algo
  // ya, pero no es un lock: cuando el reconocimiento por audio (que sí sabe qué
  // suena) diga otra cosa, se le hace caso al instante en vez de gastar los dos
  // ciclos de histéresis. Un título genérico es un hint, nunca una certeza.
  private currentTrackProvisional = false;

  // Claves alias de la pista ACTUAL. La misma canción llega con metadata
  // distinta según la fuente (AudD: "Houdini"/"Dua Lipa"; SMTC de YouTube:
  // "Dua Lipa - Houdini (Official Video)"/"DuaLipaVEVO"). Cuando la identidad
  // difusa (looksLikeSameTrack) reconoce a un recién llegado como la pista en
  // curso, su clave se registra aquí para resolver los próximos eventos por
  // comparación exacta (barata) y sin recargar la letra.
  private trackAliasKeys = new Set<string>();

  // Fuente externa suprimida. Cuando el micrófono maneja audio EXTERNO al PC
  // (parlante de la pieza, teléfono), las sesiones de medios de Windows (SMTC)
  // son irrelevantes y no deben cambiar la pista, la posición ni el play/pausa:
  // pisarían la letra que identificó el micrófono. El renderer lo activa al
  // iniciar reconocimiento por micrófono y lo apaga al parar / cambiar a system.
  private externalInputSuppressed = false;

  // Fuente de reconocimiento activa en el renderer (SING). Con 'system', el
  // fingerprint del audio (AudD/Shazam) es la VERDAD de lo que suena; la
  // sesión SMTC (p. ej. YouTube en un navegador) solo colabora si su metadata
  // coincide con la pista en curso. Sin este arbitraje, una sesión con
  // metadata irreconocible recargaba la letra y entraba en loop con AudD.
  private recognitionSource: 'microphone' | 'system' | null = null;

  /** true si la sesión SMTC actual corresponde a la pista mostrada; en false
   *  sus eventos de posición/pausa se ignoran (son de OTRA cosa). */
  private externalTrusted = true;

  /** Última pista SMTC ignorada por el bloqueo de identidad: sirve para
   *  corroborar el próximo match de AudD y saltarse la histéresis. */
  private lastUnmatchedExternal: { title: string; artist: string; at: number } | null = null;
  private static readonly EXTERNAL_CORROBORATION_TTL_MS = 90_000;

  /** Pide al renderer re-identificar YA (cambio de pista no confirmable). */
  private resyncRequester: (() => void) | null = null;
  /** -Infinity y no 0: con 0 la primera petición quedaba dentro del throttle. */
  private lastResyncRequestAt = Number.NEGATIVE_INFINITY;
  /** Mínimo entre peticiones de resync: un ciclo de captura completo. */
  private static readonly RESYNC_THROTTLE_MS = 10_000;

  private readonly displayStore: DisplayStore;
  private readonly translationStore: TranslationStore;
  private readonly readingStore: ReadingStore;
  private readonly lyricsService: LyricsService;

  /** Color resuelto por auto-contraste (null = usar manual). */
  private autoContrastColor: string | null = null;
  private autoLightBackground = false;

  /** Último modelo emitido (para feedback de precisión / diagnósticos). */
  private lastModel: RenderModel | null = null;

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
      locked: lyrics != null && !this.currentTrackProvisional,
      provisional: this.currentTrackProvisional,
      titleDistinctiveness: title ? scoreTitleDistinctiveness(title) : null,
      identity: {
        wrongSong: this.wrongSong ? { ...this.wrongSong } : null,
        requiredHits: this.osStillConfirmsCurrentTrack(at)
          ? this.WRONG_SONG_STRIKE_LIMIT
          : this.CHANGE_CONFIRM_COUNT,
        osStillConfirmsCurrent: this.osStillConfirmsCurrentTrack(at),
        recognitionSource: this.recognitionSource,
        externalTrusted: this.externalTrusted,
        externalInputSuppressed: this.externalInputSuppressed,
        lastExternalTitle: this.lastExternalTitle,
        lastUnmatchedExternal: this.lastUnmatchedExternal,
        autoRetryPending: this.autoRetry.isPending,
      },
      sync: {
        displayedPositionMs: Math.round(this.clock.getDisplayedPosition(at)),
        offsetMs: this.clock.getSyncOffsetMs(),
        calibrationOffsetMs: this.clock.getCalibrationOffsetMs(),
        paused: this.clock.isClockPaused(),
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
    this.readingStore = readingStore;
    this.clock = new SyncClock(offsetStore, calibrationStore);
    this.applyDisplaySettings();
    this.applyReadingSettings();
  }

  /** Sincroniza ajustes de lectura (pinyin con/sin tonos) con romanize.ts. */
  applyReadingSettings(): void {
    setPinyinToneType(this.readingStore.get().pinyinToneType);
  }

  /** Sincroniza ajustes visuales persistidos con el SyncEngine. */
  applyDisplaySettings(): void {
    const d = this.displayStore.get();
    this.engine.renderConfig.fontScale = d.fontScale;
    this.engine.renderConfig.opacity = d.opacity;
    this.engine.renderConfig.alignment = d.alignment;
    this.engine.renderConfig.mirrorMode = d.mirrorMode;
    this.engine.renderConfig.windowSize = d.lyricsWindowSize;
    if (d.textColorMode !== 'auto') {
      this.clearAutoContrast();
    }
  }

  /** Actualiza el color efectivo desde el servicio de auto-contraste. */
  setAutoContrast(color: string, lightBackground: boolean): void {
    this.autoContrastColor = color;
    this.autoLightBackground = lightBackground;
  }

  /** Limpia el override de auto-contraste (vuelve al color manual). */
  clearAutoContrast(): void {
    this.autoContrastColor = null;
    this.autoLightBackground = false;
  }

  private resolveTextAppearance(): Pick<RenderModel, 'text_color' | 'text_vignette_light'> {
    const d = this.displayStore.get();
    if (d.textColorMode === 'auto') {
      return {
        text_color: this.autoContrastColor ?? '#ffffff',
        text_vignette_light: this.autoContrastColor ? this.autoLightBackground : false,
      };
    }
    return {
      text_color: d.textColor,
      text_vignette_light: isColorDark(d.textColor),
    };
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
    this.wrongSong = null;
    // La eligió el usuario: es la verdad, no un hint.
    this.currentTrackProvisional = false;
    this.currentTrackKey = trackKey;
    this.lastMatchKey = trackKey;
    this.autoRetry.reset();
    this.clock.setCurrentTrackKey(trackKey);
    this.clock.loadSyncOffset(trackKey);
    this.overrideStatus = null;
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

    const updated: TimedLyrics = {
      ...lyrics,
      translationLang: targetLang,
      lines: lyrics.lines.map((line, i) => ({
        ...line,
        translation: result.translations![i],
      })),
    };

    this.setLyrics(updated, this.trackTitle, this.trackArtist);
    await this.lyricsService.updateCachedLyrics(this.currentTrackKey, updated, {
      title: this.trackTitle ?? '',
      artist: this.trackArtist ?? '',
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
    // Identidad nueva: limpiar aliases y contador de reintentos de la anterior.
    if (trackKey !== this.currentTrackKey) {
      this.trackAliasKeys.clear();
      this.autoRetry.reset();
    }
    this.autoRetry.cancel();
    this.currentTrackKey = trackKey;
    this.lastMatchKey = trackKey;
    this.clock.setCurrentTrackKey(trackKey);
    this.clock.loadSyncOffset(trackKey); // offset crónico persistido + resetea corrección
    // Cargar una pista nueva implica que hay audio sonando: salir de pausa.
    this.clock.resetPlaybackState();
    this.overrideStatus = 'FETCHING_LYRICS';
    this.trackTitle = title;
    this.trackArtist = artist;

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
      this.wrongSong = null;
      // Dos señales independientes (título del SO + huella del audio) dicen lo
      // mismo: la identidad deja de ser provisional y pasa a estar lockeada.
      this.currentTrackProvisional = false;
      this.applyCorrection(anchor);
      if (this.overrideStatus === 'LISTENING' || this.overrideStatus === 'IDENTIFYING') {
        this.overrideStatus = null;
      }
      return false;
    }

    // Corroboración de dos fuentes independientes: si SMTC ya reportó una
    // pista (bloqueada por el arbitraje) y este match de AudD la reconoce como
    // la misma canción, el cambio es real → confirmar sin esperar la
    // histéresis (ahorra un ciclo de corrección de ~18s).
    const ext = this.lastUnmatchedExternal;
    const corroborated =
      ext != null &&
      Date.now() - ext.at < StateStore.EXTERNAL_CORROBORATION_TTL_MS &&
      looksLikeSameTrack({ title, artist }, ext);

    // Histéresis compartida (mic + SMTC): un cambio de pista no se aplica al
    // primer indicio; una mis-identificación puntual no debe arrancar la letra.
    if (!corroborated && !this.confirmTrackChange(matchKey)) {
      // Aún no confirmado: mantener la letra actual intacta (no tocar la
      // posición: el anchor es de otra pista y desincronizaría la de ahora).
      return false;
    }
    if (corroborated) {
      this.wrongSong = null;
    }

    // El reconocimiento por audio identifica lo que SUENA: la pista deja de ser
    // provisional aunque haya entrado por un título genérico del SO.
    this.currentTrackProvisional = false;
    await this.loadLyricsByMetadata(
      title,
      artist,
      anchor.positionMs,
      anchor.anchorAt,
      album ?? null,
      duration_ms ?? null,
    );
    if (corroborated && ext) {
      // La sesión SMTC bloqueada ERA esta canción: registrar su clave como
      // alias (los próximos eventos 'track' resuelven por comparación exacta)
      // y volver a confiar en sus posiciones.
      this.trackAliasKeys.add(normalizeTrackKey(ext.artist, ext.title));
      this.externalTrusted = true;
      this.lastUnmatchedExternal = null;
    }
    return true;
  }

  /**
   * Histéresis de cambio de pista para el micrófono/AudD (applyMatch): el loop
   * de corrección re-identifica cada ~18s, así que exigir varios ciclos filtra
   * una mis-identificación puntual. (SMTC NO la usa: sus eventos 'track' son
   * únicos por cambio real, exigir 2 lo dejaría clavado en una canción.)
   * Devuelve true si el cambio a `matchKey` está CONFIRMADO (recargar la letra);
   * false si todavía no (mantener la actual).
   * Si no hay letra mostrándose cambia de inmediato (identificación inicial o
   * pista sin letra: no hay nada que proteger). Requiere ver la MISMA pista
   * nueva CHANGE_CONFIRM_COUNT ciclos seguidos antes de confirmar.
   */
  private confirmTrackChange(matchKey: string): boolean {
    if (!this.engine.getLyrics()) {
      this.wrongSong = null;
      return true;
    }
    // La pista en pantalla entró por un título genérico del SO: es un hint, no
    // un lock. El audio sabe qué suena de verdad; no hay nada que proteger.
    if (this.currentTrackProvisional) {
      this.wrongSong = null;
      return true;
    }

    const osConfirms = this.osStillConfirmsCurrentTrack();
    const required = osConfirms ? this.WRONG_SONG_STRIKE_LIMIT : this.CHANGE_CONFIRM_COUNT;

    if (this.wrongSong?.songIdentified === matchKey) {
      this.wrongSong.consecutiveHits += 1;
    } else {
      this.wrongSong = {
        songIdentified: matchKey,
        consecutiveHits: 1,
        titleStillSays: osConfirms ? (this.lastExternalTitle?.title ?? '') : '',
      };
    }

    if (this.wrongSong.consecutiveHits >= required) {
      if (osConfirms) {
        console.warn(
          `[identidad] el audio insistió ${this.wrongSong.consecutiveHits} veces en "${matchKey}" ` +
            `mientras el SO seguía diciendo "${this.wrongSong.titleStillSays}": se rompe el lock`,
        );
      }
      this.wrongSong = null;
      return true;
    }
    return false;
  }

  /**
   * ¿La sesión de medios del SO sigue afirmando la canción que se muestra?
   *
   * Es la SEGUNDA señal, independiente del audio. Si el SO sigue en la misma
   * canción y el reconocedor dice otra cosa, las señales están en conflicto:
   * una sola no basta para soltar el lock (una mis-identificación puntual
   * arrancaría la letra correcta). Solo cuenta si la sesión está VIVA: un
   * título viejo de una sesión muerta no confirma nada.
   */
  private osStillConfirmsCurrentTrack(at: number = Date.now()): boolean {
    if (this.externalInputSuppressed) return false;
    const external = this.lastExternalTitle;
    if (!external) return false;
    if (at - this.lastExternalActivityAt >= StateStore.EXTERNAL_LIVENESS_MS) return false;
    if (this.trackTitle == null) return false;
    return looksLikeSameTrack(
      { title: external.title, artist: external.artist },
      { title: this.trackTitle, artist: this.trackArtist ?? '' },
    );
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
      anchor.positionMs + Math.max(0, now - anchor.anchorAt) + this.clock.getSyncOffsetMs();
    const decision = computeDrift(estimatedNow, this.clock.getDisplayedPosition(now));

    // Diagnóstico de sincronía: el signo del error debe alternar alrededor de
    // 0. Un sesgo persistente del mismo signo delata un problema de anclaje
    // (referencia del position_ms del proveedor), no deriva del reloj.
    console.log(
      `[sync] error=${Math.round(decision.errorMs)}ms acción=${decision.action} ` +
        `(mostrado=${Math.round(this.clock.getDisplayedPosition(now))}ms, medido=${Math.round(estimatedNow)}ms)`,
    );

    if (decision.action === 'ignore') return;
    if (decision.action === 'snap') {
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
    this.externalInputSuppressed = suppressed;
  }

  /**
   * Fuente de reconocimiento activa (renderer). 'microphone' suprime SMTC por
   * completo (audio externo al PC); 'system' activa el arbitraje: AudD manda
   * en la identidad y SMTC solo aporta posición si su sesión coincide con la
   * pista actual; null (reconocimiento parado) devuelve el mando a SMTC.
   */
  setRecognitionSource(source: 'microphone' | 'system' | null): void {
    this.recognitionSource = source;
    this.externalInputSuppressed = source === 'microphone';
    // Cambio de modo: resetear la confianza y la corroboración pendiente.
    this.externalTrusted = true;
    this.lastUnmatchedExternal = null;
  }

  /** Pausa/reanuda el reloj según el estado de reproducción del SO. */
  setPlaybackState(playing: boolean, at: number = Date.now()): void {
    if (this.externalInputSuppressed) return;
    // Sesión no confiable (es de OTRA pista): su play/pausa no aplica.
    if (!this.externalTrusted) return;
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
    if (this.externalInputSuppressed) return;
    // Prueba de vida de la sesión del SO: el sidecar manda posición cada ~1s
    // pero el título solo cuando cambia. Sin esta marca no se podría distinguir
    // "el SO sigue diciendo lo mismo" de "el SO se murió hace media hora".
    this.lastExternalActivityAt = at;
    // Sesión no confiable: sus posiciones son de OTRA pista (p. ej. un video
    // de YouTube cuya metadata no coincide con lo que AudD identificó) y
    // tirarían la letra hacia cualquier parte. El reloj de pared + las
    // correcciones de AudD gobiernan hasta que la sesión vuelva a coincidir.
    if (!this.externalTrusted) return;
    if (!playing) {
      this.clock.pauseClock(at);
      return;
    }
    if (this.clock.isClockPaused()) this.clock.resumeClock(at);
    const target = Math.max(0, positionMs) + this.clock.getSyncOffsetMs();
    const decision = computeDrift(target, this.clock.getDisplayedPosition(at));
    if (decision.action === 'ignore') return;
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
    if (this.externalInputSuppressed) return false;
    const { album = null, durationMs = null, positionMs = 0, at = Date.now(), playing = true } = options;
    const key = normalizeTrackKey(artist, title);
    // Se registra SIEMPRE, coincida o no: es la segunda señal del arbitraje.
    // Que el SO siga diciendo la misma canción es información, no ruido.
    this.lastExternalTitle = { title, artist, at };
    this.lastExternalActivityAt = at;
    // Comparación tolerante: el título de video de YouTube ("Artista - Canción
    // (Official Video)" con canal como artista) y la metadata canónica de AudD
    // son la MISMA pista; sin esto, cada fuente "cambiaba" la canción de la
    // otra y la letra entraba en un loop de recarga (bug YouTube vs Spotify).
    if (this.matchesCurrentTrack(key, title, artist)) {
      // La sesión SMTC coincide con la pista en curso: vuelve a ser confiable
      // (sus posiciones y play/pausa aplican).
      this.externalTrusted = true;
      this.lastUnmatchedExternal = null;
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
      this.engine.getLyrics() &&
      (this.recognitionSource === 'system' ||
        // Título del SO poco identificable ("Awake") mientras el audio puede
        // arbitrar: no desplaza la letra en pantalla, solo pide confirmación.
        (this.recognitionSource != null && !isDistinctiveTitle(title)))
    ) {
      // BLOQUEO DE IDENTIDAD (bug YouTube): con reconocimiento por sistema
      // activo y letra en pantalla, el fingerprint del audio es la verdad de
      // lo que SUENA. Una sesión SMTC cuya metadata no calza (título de video
      // irreconocible, otra pestaña, sesión zombie de un sidecar viejo) NO
      // recarga la letra — eso era el loop: recarga SMTC ↔ recarga AudD.
      // Se guarda para corroborar el próximo match de AudD (cambio real de
      // canción confirma rápido) y la sesión queda como NO confiable: sus
      // posiciones dejan de tirar la letra hacia otra pista.
      this.externalTrusted = false;
      const isNewSignal =
        this.lastUnmatchedExternal == null ||
        normalizeTrackKey(this.lastUnmatchedExternal.artist, this.lastUnmatchedExternal.title) !== key;
      this.lastUnmatchedExternal = { title, artist, at };
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
    this.currentTrackProvisional = this.recognitionSource != null && !isDistinctiveTitle(title);
    if (this.currentTrackProvisional) {
      console.log(
        `[identidad] título genérico del SO "${title}" ` +
          `(distintividad ${scoreTitleDistinctiveness(title).toFixed(2)}) → hint, no lock`,
      );
    }
    await this.loadLyricsByMetadata(title, artist, positionMs, at, album, durationMs);
    this.externalTrusted = true;
    this.lastUnmatchedExternal = null;
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

  /** Apariencia del handle configurada por el usuario (color/tamaño/posición). */
  private resolveHandleAppearance(): Pick<
    RenderModel,
    'handle_color' | 'handle_scale' | 'handle_position_x'
  > {
    const d = this.displayStore.get();
    return {
      handle_color: d.handleColor,
      handle_scale: d.handleScale,
      handle_position_x: d.handlePositionX,
    };
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
      ...this.resolveTextAppearance(),
      ...this.resolveHandleAppearance(),
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
      ...this.resolveTextAppearance(),
      ...this.resolveHandleAppearance(),
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
