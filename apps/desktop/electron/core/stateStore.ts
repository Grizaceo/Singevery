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
import { looksLikeSameTrack } from '../services/lyrics/normalizeQuery';
import { LyricsService, defaultLyricsService } from '../services/lyrics/lyricsService';
import { NULL_OFFSET_STORE, NULL_CALIBRATION_STORE, NULL_DISPLAY_STORE, NULL_TRANSLATION_STORE, NULL_READING_STORE } from '../services/settings';
import type { OffsetStore, CalibrationStore, DisplayStore, TranslationStore, ReadingStore } from '../services/settings';
import { setPinyinToneType } from '../services/romanize';
import { translateLines } from '../services/translate';
import type { RenderModel, Status, TimedLyrics, TrackMatch } from '../../src/types';

export type { RecognitionPhase };

const IDLE_MESSAGE = 'Esperando música...';

/** Umbral de luminancia relativa: por debajo = color de texto "oscuro". */
function isColorDark(hex: string): boolean {
  const match = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return false;
  const n = parseInt(match[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.45;
}

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

  // Histéresis de cambio de canción. El loop de corrección re-identifica con el
  // micrófono cada ~18s; una mis-identificación puntual (ruido, versión/remaster
  // con título que normaliza distinto) NO debe arrancar la letra que ya se está
  // mostrando. Sólo cambiamos cuando la MISMA pista nueva se confirma en varios
  // ciclos consecutivos.
  private readonly CHANGE_CONFIRM_COUNT = 2;
  private pendingChangeKey: string | null = null;
  private pendingChangeCount = 0;

  // Claves alias de la pista ACTUAL. La misma canción llega con metadata
  // distinta según la fuente (AudD: "Houdini"/"Dua Lipa"; SMTC de YouTube:
  // "Dua Lipa - Houdini (Official Video)"/"DuaLipaVEVO"). Cuando la identidad
  // difusa (looksLikeSameTrack) reconoce a un recién llegado como la pista en
  // curso, su clave se registra aquí para resolver los próximos eventos por
  // comparación exacta (barata) y sin recargar la letra.
  private trackAliasKeys = new Set<string>();

  // Auto-reintento de búsqueda de letra. Si una búsqueda termina en NO_LYRICS
  // o ERROR, se reintenta solo (limpiando la caché negativa) con backoff, sin
  // panel de rescate. Acotado por pista para no martillar a los proveedores.
  private static readonly AUTO_RETRY_DELAYS_MS = [4000, 15000];
  private autoRetryTimer: NodeJS.Timeout | null = null;
  private autoRetryAttempt = 0;
  private autoRetryPending = false;

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
  private readonly displayStore: DisplayStore;
  private readonly translationStore: TranslationStore;
  private readonly readingStore: ReadingStore;
  private readonly lyricsService: LyricsService;

  /** Color resuelto por auto-contraste (null = usar manual). */
  private autoContrastColor: string | null = null;
  private autoLightBackground = false;

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
    this.offsetStore = offsetStore;
    this.lyricsService = lyricsService;
    this.calibrationStore = calibrationStore;
    this.displayStore = displayStore;
    this.translationStore = translationStore;
    this.readingStore = readingStore;
    this.calibrationOffsetMs = calibrationStore.get();
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
    this.cancelAutoRetry();
  }

  // ==========================================================================
  // Auto-reintento de búsqueda de letra (reemplaza al panel de rescate).
  // ==========================================================================

  private cancelAutoRetry(): void {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
      this.autoRetryTimer = null;
    }
    this.autoRetryPending = false;
  }

  /** Programa un reintento automático de la búsqueda que acaba de fallar. */
  private scheduleAutoRetry(
    trackKey: string,
    title: string,
    artist: string,
    album: string | null,
    durationMs: number | null,
  ): void {
    if (this.autoRetryAttempt >= StateStore.AUTO_RETRY_DELAYS_MS.length) return;
    const delay = StateStore.AUTO_RETRY_DELAYS_MS[this.autoRetryAttempt];
    this.autoRetryPending = true;
    this.autoRetryTimer = setTimeout(() => {
      this.autoRetryTimer = null;
      this.autoRetryPending = false;
      // La pista cambió mientras esperábamos: el reintento ya no aplica.
      if (this.currentTrackKey !== trackKey) return;
      this.autoRetryAttempt += 1;
      this.retrySearch(title, artist, album, durationMs).catch(() => {
        /* el estado ERROR ya quedó reflejado por loadLyricsByMetadata */
      });
    }, delay);
    // No retener el proceso vivo por un reintento pendiente.
    this.autoRetryTimer.unref?.();
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
    const wasPaused = this.clockPaused;
    // Ancla cruda actual (sin offset crónico: loadLyricsByMetadata lo re-suma).
    const rawAnchor = Math.max(0, this.currentPosition(now) - this.syncOffsetMs);
    try {
      await this.loadLyricsByMetadata(title, artist, rawAnchor, now, album, durationMs);
    } catch {
      // loadLyricsByMetadata ya dejó overrideStatus en ERROR y re-programó.
    }
    if (wasPaused) this.pauseClock();
  }

  setLyrics(lyrics: TimedLyrics | null, title?: string, artist?: string): void {
    this.engine.setLyrics(lyrics);
    this.trackTitle = title;
    this.trackArtist = artist;
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
    // Identidad nueva: limpiar aliases y contador de reintentos de la anterior.
    if (trackKey !== this.currentTrackKey) {
      this.trackAliasKeys.clear();
      this.autoRetryAttempt = 0;
    }
    this.cancelAutoRetry();
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
      this.autoRetryAttempt = 0;
      this.setLyrics(lyrics, title, artist);
      this.reanchor(projected.positionMs + this.syncOffsetMs, projected.anchorAt);
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
        ? adjustMatchPosition(match, recordStartedAt, this.calibrationOffsetMs)
        : { positionMs: match.position_ms, anchorAt: match.matched_at };

    // Misma canción (por clave exacta, alias o identidad difusa — la metadata
    // de AudD y la del SMTC de un navegador difieren para el mismo tema):
    // reconciliar deriva sin recargar ni tapar la letra. Confirmar la pista
    // actual descarta cualquier cambio pendiente.
    if (this.engine.getLyrics() && this.matchesCurrentTrack(matchKey, title, artist)) {
      this.pendingChangeKey = null;
      this.pendingChangeCount = 0;
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
      this.pendingChangeKey = null;
      this.pendingChangeCount = 0;
    }

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
      this.pendingChangeKey = null;
      this.pendingChangeCount = 0;
      return true;
    }
    if (this.pendingChangeKey === matchKey) {
      this.pendingChangeCount += 1;
    } else {
      this.pendingChangeKey = matchKey;
      this.pendingChangeCount = 1;
    }
    if (this.pendingChangeCount >= this.CHANGE_CONFIRM_COUNT) {
      this.pendingChangeKey = null;
      this.pendingChangeCount = 0;
      return true;
    }
    return false;
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

    // Diagnóstico de sincronía: el signo del error debe alternar alrededor de
    // 0. Un sesgo persistente del mismo signo delata un problema de anclaje
    // (referencia del position_ms del proveedor), no deriva del reloj.
    console.log(
      `[sync] error=${Math.round(decision.errorMs)}ms acción=${decision.action} ` +
        `(mostrado=${Math.round(this.currentPosition(now))}ms, medido=${Math.round(estimatedNow)}ms)`,
    );

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
    this.learnGlobalLatency();
  }

  // ==========================================================================
  // Latencia global — "todas las canciones van un poco atrasadas".
  //
  // El offset por pista existe para problemas DE esa pista (un LRC mal
  // timeado). Si el usuario corrige varias pistas distintas en el MISMO
  // sentido y por una magnitud parecida, eso no es de las pistas: es latencia
  // del equipo (captura del audio del sistema, anclaje del reconocedor, etc.).
  // Se promueve a la calibración global para que las canciones NUEVAS ya
  // nazcan sincronizadas, en vez de tener que corregir una por una.
  // ==========================================================================

  /** Pistas distintas con corrección coherente antes de aprender la latencia. */
  private static readonly LATENCY_LEARN_MIN_TRACKS = 3;
  /** Por debajo de esto no vale la pena mover la calibración global. */
  private static readonly LATENCY_LEARN_MIN_MS = 250;

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
    if (this.currentTrackKey) {
      this.offsetStore.set(this.currentTrackKey, this.syncOffsetMs);
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
    const values = Object.values(entries).filter((v) => Math.abs(v) >= StateStore.LATENCY_LEARN_MIN_MS);
    if (values.length < StateStore.LATENCY_LEARN_MIN_TRACKS) return;
    // Todas en el mismo sentido: si las hay de ambos signos, no es global.
    const positive = values.every((v) => v > 0);
    const negative = values.every((v) => v < 0);
    if (!positive && !negative) return;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    if (Math.abs(median) < StateStore.LATENCY_LEARN_MIN_MS) return;

    console.log(
      `[sync] latencia global aprendida de ${values.length} pistas: ${median}ms ` +
        `(calibración ${this.calibrationOffsetMs} → ${this.calibrationOffsetMs + median})`,
    );
    this.promoteToCalibration(median);
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
    if (playing) this.resumeClock(at);
    else this.pauseClock(at);
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
    // Sesión no confiable: sus posiciones son de OTRA pista (p. ej. un video
    // de YouTube cuya metadata no coincide con lo que AudD identificó) y
    // tirarían la letra hacia cualquier parte. El reloj de pared + las
    // correcciones de AudD gobiernan hasta que la sesión vuelva a coincidir.
    if (!this.externalTrusted) return;
    if (!playing) {
      this.pauseClock(at);
      return;
    }
    if (this.clockPaused) this.resumeClock(at);
    const target = Math.max(0, positionMs) + this.syncOffsetMs;
    const decision = computeDrift(target, this.currentPosition(at));
    if (decision.action === 'ignore') return;
    if (decision.action === 'snap') {
      this.reanchor(target, at);
      return;
    }
    // 'correct': suaviza el microsalto con la misma rampa que la deriva de AudD.
    this.settle(at);
    this.correctionTargetMs = decision.correctionMs;
    this.correctionStartedAt = at;
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
    } else if (this.recognitionSource === 'system' && this.engine.getLyrics()) {
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
    } else if (!playing && this.engine.getLyrics() && !this.clockPaused) {
      // Una sesión EN PAUSA no roba la letra de lo que está sonando: Windows a
      // veces parpadea la "sesión actual" entre apps (navegador ↔ Spotify) y
      // ese flip transitorio no debe recargar nada.
      return false;
    }
    // SMTC no lleva histéresis por conteo: el sidecar emite 'track' una sola
    // vez por cambio real (evento del SO, autoritativo). Exigir 2 eventos haría
    // que nunca cambiara de canción. En modo micrófono SMTC va suprimido; el
    // parpadeo espurio entre sesiones del PC es raro y se corrige al instante.
    await this.loadLyricsByMetadata(title, artist, positionMs, at, album, durationMs);
    this.externalTrusted = true;
    this.lastUnmatchedExternal = null;
    if (!playing) this.pauseClock(at);
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
        return this.autoRetryPending ? 'Sin letra aún · reintentando...' : 'Sin letra disponible';
      case 'ERROR':
        return this.autoRetryPending ? 'Error al buscar letra · reintentando...' : 'Error al buscar letra';
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

    const model = this.engine.getRenderModel(this.currentPosition(), 'DISPLAYING');
    const full: RenderModel = {
      ...model,
      ...this.resolveTextAppearance(),
      ...this.resolveHandleAppearance(),
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
