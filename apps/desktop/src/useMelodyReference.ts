import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { recordChunk, SystemAudioSession } from './audio/capture';
import { extractMelody, smoothMelody, toReferencePoints, type MelodyPoint } from './audio/melody';
import { pointsToCurve, curveToPoints } from './useTeacherReference';
import { assembleReferenceBuffer, chunksToSegments } from './audio/referenceAssembly';

/**
 * useMelodyReference — captura y cachea la melodía de referencia de la canción
 * actual (P1 de SWAP-PITCH-001).
 *
 * Decisión de diseño: la referencia NO es una partitura oficial. Se extrae de
 * la PROPIA canción capturando el loopback del sistema durante unos segundos y
 * analizando la frecuencia dominante en rango vocal. La UI avisa que es una
 * interpretación automática de la app.
 *
 * Persistencia: se guarda en DISCO (ReferenceStore del main, bajo
 * userData/references) usando el mismo canal que las referencias del profesor
 * (references:save / references:getForTrack). Así el pitch de una canción se
 * captura UNA vez y queda en una carpeta del PC del usuario para siempre —
 * el karaoke funciona directo la próxima vez, sin repetir el proceso.
 *
 * Migración: si hay una referencia vieja en localStorage (formato anterior),
 * se usa y se migra al disco en la primera captura nueva.
 */

/** Segundos de loopback a capturar para la referencia (audio ÚTIL, sin silencio). */
const CAPTURE_TARGET_SECONDS = 24;
/** Duración de cada chunk de captura. */
const CHUNK_SECONDS = 6;
/** Máximo de chunks intentados (silencio o fallos). 8 × 6 s = 48 s de tope. */
const MAX_CHUNKS = 8;
/** Espera inicial: chunks de 1 s hasta que el loopback tenga señal. La
 *  referencia se captura del audio del SISTEMA (no del micrófono); si la
 *  canción está pausada al pulsar ♪, esperamos a que suene en vez de gastar
 *  los chunks de captura en silencio y fallar. */
const WARMUP_CHUNK_MS = 1000;
const WARMUP_MAX_MS = 30000;
/** Mínimo de audio útil para aceptar la referencia. */
const MIN_USEFUL_SECONDS = 8;

// --- Caché en memoria (fuente de verdad para el render) ---------------------
// El disco es la persistencia; esta caché evita re-leer el disco en cada
// render y permite que recapture() invalide al instante.

type MelodyCache = Record<string, MelodyPoint[]>;

class MelodyCacheStore {
  private cache: MelodyCache = {};
  private listeners = new Set<() => void>();

  get(key: string): MelodyPoint[] | null {
    const v = this.cache[key];
    return v && v.length > 0 ? v : null;
  }

  set(key: string, value: MelodyPoint[]): void {
    this.cache[key] = value;
    this.emit();
  }

  remove(key: string): void {
    delete this.cache[key];
    this.emit();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): number => this.version;

  private version = 0;
  private emit(): void {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }
}

// Store singleton del módulo.
const cacheStore = new MelodyCacheStore();

export type MelodyCaptureStatus = 'idle' | 'capturing' | 'ready' | 'error';

export function useMelodyReference(
  trackKey: string | null,
  enabled: boolean,
  getPositionMs: () => number | null = () => null,
): {
  reference: MelodyPoint[] | null;
  status: MelodyCaptureStatus;
  error: string | null;
  /** true si la canción aún no tiene referencia guardada (primera vez). */
  needsCapture: boolean;
  /** Fuerza una recaptura (útil si la referencia salió pobre). */
  recapture: () => void;
} {
  const [status, setStatus] = useState<MelodyCaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [needsCapture, setNeedsCapture] = useState(false);
  /** Solicitud explícita de recaptura (F6): al cambiar, el efecto relanza la captura. */
  const [recaptureRequest, setRecaptureRequest] = useState(0);
  /** Marca cada fin de captura: re-dispara el efecto si quedó una petición pendiente (F5/F6). */
  const [captureDoneTick, setCaptureDoneTick] = useState(0);

  const busyRef = useRef(false);
  const wantCaptureRef = useRef(false);
  /** Generación de captura: invalida doCapture en vuelo al cambiar canción o desactivar (F5). */
  const captureGenRef = useRef(0);
  /** Clave para la que corre la captura actual (F5). */
  const captureKeyRef = useRef<string | null>(null);

  // La caché es una fuente externa: suscribirse y leer el snapshot.
  useSyncExternalStore(cacheStore.subscribe, cacheStore.getSnapshot);
  const reference = trackKey ? cacheStore.get(trackKey) : null;

  // Carga desde el DISCO al cambiar de canción: la referencia guardada de una
  // canción ya capturada aparece al instante (sin volver a capturar).
  // Todo setState vive dentro del callback asíncrono (con guarda de
  // cancelación): el estado no se toca en el cuerpo del efecto.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!trackKey) {
        if (!cancelled) {
          setNeedsCapture(false);
          setStatus('idle');
        }
        return;
      }
      if (cacheStore.get(trackKey) != null) {
        if (!cancelled) {
          setNeedsCapture(false);
          setStatus('ready');
        }
        return;
      }
      const api = window.api;
      if (!api?.getReferenceForTrack) {
        if (!cancelled) setNeedsCapture(true);
        return;
      }
      try {
        const result = await api.getReferenceForTrack(trackKey);
        if (cancelled) return;
        if (result.ok && result.reference) {
          const points = curveToPoints(result.reference.curve);
          if (points.length > 0) {
            cacheStore.set(trackKey, points);
            setNeedsCapture(false);
            setStatus('ready'); // F6: referencia persistida = lista
            return;
          }
        }
      } catch {
        /* sin almacén: se captura igual */
      }
      if (!cancelled) {
        setNeedsCapture(true);
        setStatus('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackKey]);

  const doCapture = useCallback(async (key: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    // Generación de esta captura: si cambia la canción o se desactiva el
    // monitor, la captura se aborta en el siguiente punto de espera (F5).
    const gen = ++captureGenRef.current;
    captureKeyRef.current = key;
    setStatus('capturing');
    setError(null);
    const session = new SystemAudioSession();
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Captura por chunks: los silencios NO se descartan del ensamblado —
      // se registran como segmentos nulos para conservar su posición
      // temporal real (F3). Sin esto, si el loopback no recibe señal
      // (silencio, app muteada) la captura de 30 s produce una referencia
      // vacía y falla al final.
      const segments: Array<{ samples: Float32Array | null; level: number; durationMs: number }> = [];
      let usefulSeconds = 0;
      let silentChunks = 0;
      let sampleRate = 48000;

      // Ancla temporal: posición de la canción cuando empieza la captura, para
      // alinear la melodía con los timestamps absolutos de las líneas. Si no
      // hay posición (sin canción), se usa 0 y la melodía queda relativa.
      const anchorMs = getPositionMs() ?? 0;

      // Fase de espera de señal del loopback: si la canción no está sonando al
      // pulsar ♪, esperar hasta WARMUP_MAX_MS a que llegue señal. En cuanto
      // suene, la captura procede sola (sin que el usuario haga nada).
      let signalSeen = false;
      let warmupMs = 0;
      while (!signalSeen && warmupMs < WARMUP_MAX_MS) {
        const warm = await recordChunk('system', WARMUP_CHUNK_MS, undefined, session);
        warmupMs += WARMUP_CHUNK_MS;
        signalSeen = warm.level >= 0.005;
      }
      if (!signalSeen) {
        setStatus('error');
        setError(
          'No llegó audio del sistema (30 s). La referencia se captura sola de la canción sonando — reproduce la canción y pulsa ♪ de nuevo (no usa tu micrófono).',
        );
        return;
      }
      if (gen !== captureGenRef.current) return; // cancelada durante warmup (F5)

      for (let i = 0; i < MAX_CHUNKS && usefulSeconds < CAPTURE_TARGET_SECONDS; i++) {
        const { blob, level } = await recordChunk(
          'system',
          CHUNK_SECONDS * 1000,
          undefined,
          session,
        );
        if (gen !== captureGenRef.current) return; // cancelada (F5)
        // Nivel casi nulo: chunk en silencio. NO se descarta del ensamblado:
        // se registra como segmento nulo para conservar su posición temporal
        // (F3); solo se evita el decode.
        if (level < 0.005) {
          silentChunks++;
          segments.push({ samples: null, level, durationMs: CHUNK_SECONDS * 1000 });
          continue;
        }
        const arrayBuffer = await blob.arrayBuffer();
        const ctx = new AudioCtx();
        try {
          const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
          if (gen !== captureGenRef.current) return; // cancelada (F5)
          sampleRate = decoded.sampleRate;
          segments.push({
            samples: decoded.getChannelData(0),
            level,
            durationMs: CHUNK_SECONDS * 1000,
          });
          usefulSeconds += decoded.duration;
        } finally {
          await ctx.close().catch(() => {});
        }
      }

      if (usefulSeconds < MIN_USEFUL_SECONDS) {
        setStatus('error');
        setError(
          silentChunks > 0
            ? 'No se capturó audio del sistema (silencio). La referencia sale del audio de la canción — reprodúcela y vuelve a intentar.'
            : 'No se pudo capturar el audio del sistema. Revisa que la app tenga permiso de captura.',
        );
        return;
      }

      // Ensamblar el buffer conservando las posiciones temporales REALES:
      // warmup y silencios se materializan como ceros EN SU POSICIÓN, no al
      // final (F3). El tiempo dentro del buffer combinado = tiempo real
      // transcurrido de la canción, y la melodía queda alineada con los
      // timestamps absolutos. (Antes se concatenaba solo el audio útil: un
      // silencio intermedio adelantaba el segundo segmento y el objetivo
      // lateral apuntaba a la nota equivocada.)
      const combined = assembleReferenceBuffer(
        chunksToSegments([
          { samples: null, level: 0, durationMs: warmupMs },
          ...segments,
        ]),
        sampleRate,
      );

      // Extraer melodía y desplazar los timestamps al tiempo absoluto de la
      // canción (anchor + tiempo relativo del buffer combinado).
      const melody = smoothMelody(extractMelody(combined, sampleRate)).map((p) => ({
        ...p,
        timeMs: p.timeMs + anchorMs,
      }));
      const ref = toReferencePoints(melody);
      if (ref.length < 10) {
        setStatus('error');
        setError(
          'No se pudo extraer una melodía clara de la captura. Reintenta en una parte con voz prominente.',
        );
        return;
      }

      // Guardar en DISCO (ReferenceStore del main): la curva de tono, nunca el
      // audio. Así la canción queda lista para siempre — el karaoke funciona
      // directo la próxima vez sin repetir la captura.
      // Identidad: si la canción cambió durante la captura, NO guardar una
      // mezcla A+B bajo A (F5).
      if (gen !== captureGenRef.current || captureKeyRef.current !== key) return;
      const api = window.api;
      if (api?.saveReference) {
        const saved = await api.saveReference({
          trackKey: key,
          label: 'Karaoke automático',
          instrument: 'voz',
          curve: pointsToCurve(ref),
        });
        if (gen !== captureGenRef.current) return; // cancelada (F5)
        if (!saved.ok) {
          setStatus('error');
          setError(saved.error ?? 'No se pudo guardar la referencia en disco.');
          return;
        }
      }

      if (gen !== captureGenRef.current) return; // cancelada (F5)
      cacheStore.set(key, ref);
      setNeedsCapture(false);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Error al capturar la referencia.');
    } finally {
      session.release();
      busyRef.current = false;
      if (captureKeyRef.current === key) captureKeyRef.current = null;
      // Re-disparar el efecto de captura: si quedó una petición pendiente
      // (recaptura o cambio de canción durante el vuelo), se relanza ahora
      // que el busy se liberó (F5/F6). La petición no se consumió porque el
      // efecto vio busy.
      setCaptureDoneTick((t) => t + 1);
    }
    // getPositionMs es estable (useCallback en App): incluirla para la regla
    // de exhaustive-deps sin provocar recapturas.
  }, [getPositionMs]);

  // Al cambiar la canción: marcar si hace falta captura. Este effect NO hace
  // setState síncrono: solo actualiza refs; el estado deriva de la caché vía
  // useSyncExternalStore.
  useEffect(() => {
    wantCaptureRef.current = trackKey != null && cacheStore.get(trackKey) == null;
  }, [trackKey]);

  // Invalida cualquier captura en vuelo al cambiar canción o desactivar el
  // monitor (F5): la captura vieja aborta en su siguiente punto de espera.
  // MEDIA 6 del audit Opus: si había una captura en vuelo, reponer el estado
  // derivable — si no, al volver a encender ♪ el efecto vería wantCapture
  // false y la UI quedaría clavada en "capturando" hasta cambiar de canción.
  useEffect(() => {
    captureGenRef.current += 1;
    if (busyRef.current) {
      setStatus('idle');
      wantCaptureRef.current = trackKey != null && cacheStore.get(trackKey) == null;
    }
  }, [trackKey, enabled]);

  // Captura diferida: solo cuando el monitor está ACTIVO (el usuario pulsó ♪)
  // y hay una canción sin referencia en caché. Evita capturar loopback en
  // cuanto carga la canción sin que el usuario haya pedido práctica vocal.
  // La captura arranca en un microtask: doCapture hace setState al inicio y
  // llamarla síncronamente desde el effect dispararía renders en cascada.
  // recaptureRequest (F6) relanza la captura al cambiar; si hay una captura
  // en vuelo, la petición NO se consume: doCapture la relanza al liberarse.
  useEffect(() => {
    if (!enabled || !trackKey || !wantCaptureRef.current) return;
    if (cacheStore.get(trackKey) != null) return;
    if (busyRef.current) return; // no consumir: doCapture relanza en finally (F5/F6)
    wantCaptureRef.current = false;
    const key = trackKey;
    queueMicrotask(() => void doCapture(key));
  }, [enabled, trackKey, doCapture, recaptureRequest, captureDoneTick]);

  const recapture = useCallback(() => {
    const key = trackKey;
    if (!key) return;
    // Invalida la captura en vuelo: la recaptura manda (F6).
    captureGenRef.current += 1;
    cacheStore.remove(key);
    wantCaptureRef.current = true;
    setNeedsCapture(true);
    setRecaptureRequest((r) => r + 1);
  }, [trackKey]);

  return { reference, status, error, needsCapture, recapture };
}
