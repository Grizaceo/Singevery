// ============================================================================
// identityArbiter.ts — arbitraje "¿en quién confiar: el reproductor del SO
// (MPRIS/SMTC) o el reconocimiento por audio?", extraído de StateStore.
//
// Extracción conservadora (Fase 1): los campos y las decisiones AUTOCONTENIDAS
// (no tocan el reloj de sincronía ni qué letra está cargada) viven aquí. La
// orquestación de alto nivel —applyMatch, applyExternalTrack,
// loadLyricsByMetadata— sigue en StateStore, que ahora llama a los métodos de
// esta clase en vez de tocar los campos directamente. No se reordena ninguna
// decisión: es la misma lógica, solo agrupada.
// ============================================================================

import type { EnergyCorrelation } from './energySync';
import { ENERGY_SYNC_MAX_CORRECTION_MS, ENERGY_SYNC_MIN_CONFIDENCE } from './energySync';
import { looksLikeSameTrack } from '../services/lyrics/normalizeQuery';

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

/**
 * Corte de pista visto por el monitor local de audio (renderer):
 *   - 'gap'     → hueco de silencio entre canciones. Señal FUERTE: el
 *                 reproductor terminó una pista y empezó otra.
 *   - 'novelty' → el timbre cambió de golpe sin hueco (crossfade, mezcla).
 *                 Señal DÉBIL: sirve para re-identificar antes, no para
 *                 saltarse la histéresis.
 */
export type AudioBoundaryKind = 'gap' | 'novelty';

/** Lo que IdentityArbiter necesita del reloj de sincronía: soltar una pausa
 *  que resultó ser de una sesión que ya no es de confianza. */
export interface ExternalPauseBridge {
  isPausedByExternal(): boolean;
  releaseExternalPause(): void;
}

export class IdentityArbiter {
  private wrongSong_: WrongSongStrikes | null = null;

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

  /** Última pista que reportó el SO (haya coincidido o no con la actual). */
  private lastExternalTitle_: { title: string; artist: string; at: number } | null = null;
  /** Último evento del SO de cualquier tipo: prueba de que la sesión vive. */
  private lastExternalActivityAt_ = 0;
  /** Sin señal del SO en este lapso, su último título ya no dice nada. */
  private static readonly EXTERNAL_LIVENESS_MS = 30_000;

  // Pista PROVISIONAL: entró por un título del SO poco identificable ("Awake",
  // "Alone", "Lucky Star" — ver titleDistinctiveness). Sirve para mostrar algo
  // ya, pero no es un lock: cuando el reconocimiento por audio (que sí sabe qué
  // suena) diga otra cosa, se le hace caso al instante en vez de gastar los dos
  // ciclos de histéresis. Un título genérico es un hint, nunca una certeza.
  private currentTrackProvisional_ = false;

  // Fuente externa suprimida. Cuando el micrófono maneja audio EXTERNO al PC
  // (parlante de la pieza, teléfono), las sesiones de medios de Windows (SMTC)
  // son irrelevantes y no deben cambiar la pista, la posición ni el play/pausa:
  // pisarían la letra que identificó el micrófono. El renderer lo activa al
  // iniciar reconocimiento por micrófono y lo apaga al parar / cambiar a system.
  private externalInputSuppressed_ = false;

  // Fuente de reconocimiento activa en el renderer (SING). Con 'system', el
  // fingerprint del audio (AudD/Shazam) es la VERDAD de lo que suena; la
  // sesión SMTC (p. ej. YouTube en un navegador) solo colabora si su metadata
  // coincide con la pista en curso. Sin este arbitraje, una sesión con
  // metadata irreconocible recargaba la letra y entraba en loop con AudD.
  private recognitionSource_: 'microphone' | 'system' | null = null;

  /** true si la sesión SMTC actual corresponde a la pista mostrada; en false
   *  sus eventos de posición/pausa se ignoran (son de OTRA cosa). */
  private externalTrusted_ = true;

  /** Última pista SMTC ignorada por el bloqueo de identidad: sirve para
   *  corroborar el próximo match de AudD y saltarse la histéresis. */
  private lastUnmatchedExternal_: { title: string; artist: string; at: number } | null = null;
  private static readonly EXTERNAL_CORROBORATION_TTL_MS = 90_000;

  /**
   * Último corte de pista visto por el monitor local de audio (renderer).
   *
   * Es la tercera señal del arbitraje, y la única que funciona SIN reproductor
   * del SO (parlante externo, micrófono, vinilo): un hueco de silencio entre
   * canciones es evidencia física de que la pista terminó. Cuando el
   * fingerprint identifica otra canción justo después de un hueco, hay dos
   * señales independientes y el cambio se aplica sin gastar el segundo ciclo
   * de histéresis (~20 s de letra vieja en pantalla).
   */
  private lastAudioBoundary_: { kind: AudioBoundaryKind; at: number } | null = null;
  /** Pasado este lapso, el corte ya no explica el match que llega. Cubre con
   *  holgura grabar (6 s) + identificar, incluso con un reintento por medio. */
  private static readonly BOUNDARY_CORROBORATION_TTL_MS = 30_000;

  /** Re-identificaciones ya pedidas por "la letra no explica el audio", para la
   *  pista en curso. Se reinicia al cargar otra. */
  private mismatchResyncs_ = 0;
  /** Tope: pasadas estas, insistir no aporta (ver maybeRequestResyncOnMiss). */
  private static readonly MISMATCH_RESYNC_LIMIT = 2;

  constructor(private readonly pauseBridge: ExternalPauseBridge) {}

  // ---- accesores (mismo nombre que los campos originales de StateStore) ----

  get wrongSong(): WrongSongStrikes | null {
    return this.wrongSong_;
  }
  set wrongSong(v: WrongSongStrikes | null) {
    this.wrongSong_ = v;
  }

  get lastExternalTitle(): { title: string; artist: string; at: number } | null {
    return this.lastExternalTitle_;
  }
  set lastExternalTitle(v: { title: string; artist: string; at: number } | null) {
    this.lastExternalTitle_ = v;
  }

  get lastExternalActivityAt(): number {
    return this.lastExternalActivityAt_;
  }
  set lastExternalActivityAt(v: number) {
    this.lastExternalActivityAt_ = v;
  }

  get currentTrackProvisional(): boolean {
    return this.currentTrackProvisional_;
  }
  set currentTrackProvisional(v: boolean) {
    this.currentTrackProvisional_ = v;
  }

  get externalInputSuppressed(): boolean {
    return this.externalInputSuppressed_;
  }

  get recognitionSource(): 'microphone' | 'system' | null {
    return this.recognitionSource_;
  }

  get externalTrusted(): boolean {
    return this.externalTrusted_;
  }
  set externalTrusted(v: boolean) {
    this.externalTrusted_ = v;
  }

  get lastUnmatchedExternal(): { title: string; artist: string; at: number } | null {
    return this.lastUnmatchedExternal_;
  }
  set lastUnmatchedExternal(v: { title: string; artist: string; at: number } | null) {
    this.lastUnmatchedExternal_ = v;
  }

  get lastAudioBoundary(): { kind: AudioBoundaryKind; at: number } | null {
    return this.lastAudioBoundary_;
  }
  set lastAudioBoundary(v: { kind: AudioBoundaryKind; at: number } | null) {
    this.lastAudioBoundary_ = v;
  }

  get mismatchResyncs(): number {
    return this.mismatchResyncs_;
  }
  set mismatchResyncs(v: number) {
    this.mismatchResyncs_ = v;
  }

  get changeConfirmCount(): number {
    return this.CHANGE_CONFIRM_COUNT;
  }
  get wrongSongStrikeLimit(): number {
    return this.WRONG_SONG_STRIKE_LIMIT;
  }
  /** TTL compartido con StateStore: corrobora tanto un match de audio contra
   *  una sesión SMTC antes bloqueada (identidad) como un ancla en cuarentena
   *  contra la siguiente (reloj) — mismo plazo, un solo origen de verdad. */
  get externalCorroborationTtlMs(): number {
    return IdentityArbiter.EXTERNAL_CORROBORATION_TTL_MS;
  }

  // ---- decisiones ----

  /**
   * ¿Hay un cambio de canción a medio confirmar? El renderer lo consulta tras
   * cada corrección para encadenar el ciclo siguiente sin pausa: la histéresis
   * necesita otra identificación y esperarla 12 s deja la letra vieja en
   * pantalla todo ese rato.
   */
  isChangeSuspected(): boolean {
    return this.wrongSong_ != null;
  }

  /**
   * El monitor local de audio vio un corte de pista. Solo se anota: la letra
   * NO se toca aquí. Quien decide sigue siendo el fingerprint; el corte es la
   * evidencia que le permite confirmar el cambio a la primera.
   */
  noteAudioBoundary(kind: AudioBoundaryKind, at: number = Date.now()): void {
    this.lastAudioBoundary_ = { kind, at };
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
  osStillConfirmsCurrentTrack(
    trackTitle: string | undefined,
    trackArtist: string | undefined,
    at: number = Date.now(),
  ): boolean {
    if (this.externalInputSuppressed_) return false;
    const external = this.lastExternalTitle_;
    if (!external) return false;
    if (at - this.lastExternalActivityAt_ >= IdentityArbiter.EXTERNAL_LIVENESS_MS) return false;
    if (trackTitle == null) return false;
    return looksLikeSameTrack(
      { title: external.title, artist: external.artist },
      { title: trackTitle, artist: trackArtist ?? '' },
    );
  }

  /**
   * ¿Un corte de audio reciente respalda que la canción cambió DE VERDAD?
   *
   * Solo el hueco de silencio ('gap') cuenta: es evidencia física de que una
   * pista terminó. La novedad espectral es demasiado fácil de disparar con un
   * cambio de sección para saltarse la histéresis con ella.
   *
   * Y no vale si la sesión del SO sigue afirmando la canción que se muestra:
   * ahí el hueco es casi seguro otra cosa (el usuario pausó, un bache de
   * volumen) y el SO —que sí sabe qué está reproduciendo— manda.
   */
  boundaryCorroborates(at: number, trackTitle: string | undefined, trackArtist: string | undefined): boolean {
    const boundary = this.lastAudioBoundary_;
    if (!boundary || boundary.kind !== 'gap') return false;
    if (at - boundary.at > IdentityArbiter.BOUNDARY_CORROBORATION_TTL_MS) return false;
    return !this.osStillConfirmsCurrentTrack(trackTitle, trackArtist, at);
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
  confirmTrackChange(
    matchKey: string,
    hasLyrics: boolean,
    trackTitle: string | undefined,
    trackArtist: string | undefined,
  ): boolean {
    if (!hasLyrics) {
      this.wrongSong_ = null;
      return true;
    }
    // La pista en pantalla entró por un título genérico del SO: es un hint, no
    // un lock. El audio sabe qué suena de verdad; no hay nada que proteger.
    if (this.currentTrackProvisional_) {
      this.wrongSong_ = null;
      return true;
    }

    const osConfirms = this.osStillConfirmsCurrentTrack(trackTitle, trackArtist);
    const required = osConfirms ? this.WRONG_SONG_STRIKE_LIMIT : this.CHANGE_CONFIRM_COUNT;

    if (this.wrongSong_?.songIdentified === matchKey) {
      this.wrongSong_.consecutiveHits += 1;
    } else {
      this.wrongSong_ = {
        songIdentified: matchKey,
        consecutiveHits: 1,
        titleStillSays: osConfirms ? (this.lastExternalTitle_?.title ?? '') : '',
      };
    }

    if (this.wrongSong_.consecutiveHits >= required) {
      if (osConfirms) {
        console.warn(
          `[identidad] el audio insistió ${this.wrongSong_.consecutiveHits} veces en "${matchKey}" ` +
            `mientras el SO seguía diciendo "${this.wrongSong_.titleStillSays}": se rompe el lock`,
        );
      }
      this.wrongSong_ = null;
      return true;
    }
    return false;
  }

  /**
   * Suprime (o rehabilita) la fuente externa SMTC. En modo micrófono con audio
   * externo al PC, `true` hace que applyExternalTrack/Position/setPlaybackState
   * sean no-op para que el reproductor del PC no pise la letra del micrófono.
   */
  setExternalInputSuppressed(
    suppressed: boolean,
    trackTitle: string | undefined,
    trackArtist: string | undefined,
  ): void {
    this.externalInputSuppressed_ = suppressed;
    this.refreshExternalTrust(trackTitle, trackArtist);
  }

  /**
   * Fuente de reconocimiento activa (renderer). 'microphone' suprime SMTC por
   * completo (audio externo al PC); 'system' activa el arbitraje: AudD manda
   * en la identidad y SMTC solo aporta posición si su sesión coincide con la
   * pista actual; null (reconocimiento parado) devuelve el mando a SMTC.
   */
  setRecognitionSource(
    source: 'microphone' | 'system' | null,
    trackTitle: string | undefined,
    trackArtist: string | undefined,
  ): void {
    this.recognitionSource_ = source;
    this.externalInputSuppressed_ = source === 'microphone';
    // A mode change is not evidence that the OS session belongs to the audio.
    this.refreshExternalTrust(trackTitle, trackArtist);
    this.lastUnmatchedExternal_ = null;
  }

  /**
   * Recalcula si la sesión externa (MPRIS/SMTC) sigue mereciendo confianza:
   * en modo micrófono nunca; con reconocimiento por audio activo, solo si su
   * último título coincide con la pista que se muestra. Pública porque
   * applyMatch (en StateStore) también la invoca al corroborar una sesión
   * antes bloqueada, no solo los setters de esta clase.
   */
  refreshExternalTrust(trackTitle: string | undefined, trackArtist: string | undefined): void {
    const external = this.lastExternalTitle_;
    this.externalTrusted_ =
      !this.externalInputSuppressed_ &&
      (this.recognitionSource_ == null ||
        (external != null &&
          trackTitle != null &&
          trackArtist != null &&
          looksLikeSameTrack(external, { title: trackTitle, artist: trackArtist })));
    if (!this.externalTrusted_ && this.pauseBridge.isPausedByExternal()) {
      // Keep the frozen position, but return pause ownership to the audio fallback.
      this.pauseBridge.releaseExternalPause();
    }
  }

  /**
   * Decide si una ventana de energía que NO coincide con la letra mostrada
   * amerita re-identificar de inmediato. Es el disparador de cambio de tema
   * por energía: el patrón vocal del audio ya no explica lo que se muestra.
   *
   * Solo cuando la no-coincidencia es estructural, no una mera ventana pobre:
   *   - `confidence < ENERGY_SYNC_MIN_CONFIDENCE` (la letra no responde al
   *     audio en ningún desplazamiento) PERO el pico de correlación es bajo
   *     en términos absolutos. Si el pico estuviera bien pero ambigüo (chorus
   *     trap), AudD confirmaría la misma pista: re-identificar es inocuo pero
   *     gasta una llamada; preferimos no disparar en ese caso.
   *   - O el desfase "mejor" rompe gravemente el tope: ni desplazando se alinea.
   *
   * No dispara cuando no hay letra protegida (no hay nada que re-sincronizar
   * de forma útil) ni cuando la pista es provisional (el audio ya manda).
   */
  maybeRequestResyncOnMiss(
    correlation: EnergyCorrelation,
    at: number,
    hasLyrics: boolean,
    requestResync: ((at: number) => void) | null,
  ): void {
    if (!requestResync) return;
    // Sin letra mostrándose o sin pista lockeada no hay nada que salvar.
    if (!hasLyrics || this.currentTrackProvisional_) return;
    // Ya se re-identificó por esta razón y el fingerprint sigue diciendo que es
    // la misma canción: la letra no se alinea por otro motivo (es de otra
    // VERSIÓN de la pista, o la correlación no la explica). Volver a preguntar
    // lo mismo no lo va a arreglar — solo gasta llamadas en bucle. Se corta
    // hasta que cambie la pista, que es lo único que cambia la respuesta.
    if (this.mismatchResyncs_ >= IdentityArbiter.MISMATCH_RESYNC_LIMIT) return;
    const structurallyApart =
      (correlation.confidence < ENERGY_SYNC_MIN_CONFIDENCE &&
        correlation.peak < ENERGY_SYNC_MIN_CONFIDENCE) ||
      Math.abs(correlation.offsetMs) > ENERGY_SYNC_MAX_CORRECTION_MS;
    if (!structurallyApart) return;
    this.mismatchResyncs_ += 1;
    console.warn(
      `[energía] el audio no se alinea con la letra mostrada (confianza ` +
        `${correlation.confidence.toFixed(2)}, pico ${correlation.peak.toFixed(2)}, ` +
        `offset ${correlation.offsetMs}ms) → re-identificando ` +
        `(${this.mismatchResyncs_}/${IdentityArbiter.MISMATCH_RESYNC_LIMIT})`,
    );
    if (this.mismatchResyncs_ >= IdentityArbiter.MISMATCH_RESYNC_LIMIT) {
      console.warn(
        '[energía] si el reconocedor reconfirma esta canción, la letra es de otra ' +
          'versión de la pista: no se pedirán más re-identificaciones hasta que cambie',
      );
    }
    requestResync(at);
  }
}
