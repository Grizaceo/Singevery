import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { recordChunk, SystemAudioSession } from './audio/capture';
import { extractMelody, smoothMelody, toReferencePoints, type MelodyPoint } from './audio/melody';

/**
 * useMelodyReference — captura y cachea la melodía de referencia de la canción
 * actual (P1 de SWAP-PITCH-001).
 *
 * Decisión de diseño: la referencia NO es una partitura oficial. Se extrae de
 * la PROPIA canción capturando el loopback del sistema durante unos segundos y
 * analizando la frecuencia dominante en rango vocal. La UI avisa que es una
 * interpretación automática de la app.
 *
 * Cache: por trackKey en memoria (Map) + localStorage (persistente entre
 * sesiones). Se lee con useSyncExternalStore (la caché es una fuente externa).
 */

const CACHE_KEY_PREFIX = 'espejo.melodyRef.v1.';
/** Segundos de loopback a capturar para la referencia. */
const CAPTURE_SECONDS = 30;
/** Tamaño máximo de caché persistida (canciones). */
const MAX_CACHE_ENTRIES = 50;

type MelodyCache = Record<string, MelodyPoint[]>;

// --- Store externo de caché (fuente de verdad única) -------------------------

class MelodyCacheStore {
  private cache: MelodyCache = {};
  private listeners = new Set<() => void>();

  constructor() {
    this.cache = this.load();
  }

  private load(): MelodyCache {
    try {
      const raw = localStorage.getItem(CACHE_KEY_PREFIX + 'index');
      if (!raw) return {};
      const parsed = JSON.parse(raw) as MelodyCache;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      const keys = Object.keys(this.cache);
      if (keys.length > MAX_CACHE_ENTRIES) {
        const drop = keys.length - MAX_CACHE_ENTRIES;
        for (const k of keys.slice(0, drop)) delete this.cache[k];
      }
      localStorage.setItem(CACHE_KEY_PREFIX + 'index', JSON.stringify(this.cache));
    } catch {
      /* localStorage lleno o no disponible: la caché vive en memoria igual */
    }
  }

  get(key: string): MelodyPoint[] | null {
    const v = this.cache[key];
    return v && v.length > 0 ? v : null;
  }

  set(key: string, value: MelodyPoint[]): void {
    this.cache[key] = value;
    this.persist();
    this.emit();
  }

  remove(key: string): void {
    delete this.cache[key];
    this.persist();
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
): {
  reference: MelodyPoint[] | null;
  status: MelodyCaptureStatus;
  error: string | null;
  /** Fuerza una recaptura (útil si la referencia salió pobre). */
  recapture: () => void;
} {
  const [status, setStatus] = useState<MelodyCaptureStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const busyRef = useRef(false);
  const wantCaptureRef = useRef(false);

  // La caché es una fuente externa: suscribirse y leer el snapshot.
  useSyncExternalStore(cacheStore.subscribe, cacheStore.getSnapshot);
  const reference = trackKey ? cacheStore.get(trackKey) : null;

  const doCapture = useCallback(async (key: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus('capturing');
    setError(null);
    const session = new SystemAudioSession();
    try {
      const { blob } = await recordChunk('system', CAPTURE_SECONDS * 1000, undefined, session);
      const arrayBuffer = await blob.arrayBuffer();
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      let melody: MelodyPoint[];
      try {
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        const channel = decoded.getChannelData(0);
        melody = smoothMelody(extractMelody(channel, decoded.sampleRate));
      } finally {
        await ctx.close().catch(() => {});
      }

      const ref = toReferencePoints(melody);
      if (ref.length < 10) {
        setStatus('error');
        setError(
          'No se pudo extraer una melodía clara de la captura. Reintenta en una parte con voz prominente.',
        );
        return;
      }

      cacheStore.set(key, ref);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Error al capturar la referencia.');
    } finally {
      session.release();
      busyRef.current = false;
    }
  }, []);

  // Al cambiar la canción: marcar si hace falta captura. Este effect NO hace
  // setState síncrono: solo actualiza refs; el estado deriva de la caché vía
  // useSyncExternalStore.
  useEffect(() => {
    wantCaptureRef.current = trackKey != null && cacheStore.get(trackKey) == null;
  }, [trackKey]);

  // Captura diferida: solo cuando el monitor está ACTIVO (el usuario pulsó ♪)
  // y hay una canción sin referencia en caché. Evita capturar loopback en
  // cuanto carga la canción sin que el usuario haya pedido práctica vocal.
  // La captura arranca en un microtask: doCapture hace setState al inicio y
  // llamarla síncronamente desde el effect dispararía renders en cascada.
  useEffect(() => {
    if (!enabled || !trackKey || !wantCaptureRef.current) return;
    if (cacheStore.get(trackKey) != null) return;
    wantCaptureRef.current = false;
    const key = trackKey;
    queueMicrotask(() => void doCapture(key));
  }, [enabled, trackKey, doCapture]);

  const recapture = useCallback(() => {
    const key = trackKey;
    if (!key) return;
    cacheStore.remove(key);
    wantCaptureRef.current = true;
  }, [trackKey]);

  return { reference, status, error, recapture };
}
