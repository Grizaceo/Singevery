import { useCallback, useEffect, useRef, useState } from 'react';
import { openMicrophoneStream } from './audio/capture';
import { detectPitch, type PitchResult } from './audio/pitch';
import type { MelodyPoint } from './audio/melody';

/**
 * usePitchMonitor — monitor continuo de pitch del micrófono (P0 de
 * SWAP-PITCH-001). Abre su propio stream de micrófono y muestrea el
 * AnalyserNode a ~30 fps, corriendo detectPitch (YIN/CMNDF) sobre el buffer.
 *
 * No interfiere con la captura de reconocimiento: cada stream de getUserMedia
 * es independiente y Chromium permite múltiples lectores del mismo dispositivo.
 *
 * Exposición:
 *   active   — el monitor está corriendo
 *   pitch    — último PitchResult detectado (null si silencio/ruido)
 *   error    — error de permisos/hardware
 *   window   — ventana de pitch reciente (últimos ~8 s) para el comparador P2
 *   start()  — abre el micrófono y arranca el muestreo
 *   stop()   — cierra todo
 */

/** Ventana de pitch reciente conservada para el comparador (ms). */
const PITCH_WINDOW_MS = 8000;

export function usePitchMonitor(): {
  active: boolean;
  pitch: PitchResult | null;
  error: string | null;
  window: MelodyPoint[];
  start: () => Promise<void>;
  stop: () => void;
} {
  const [active, setActive] = useState(false);
  const [pitch, setPitch] = useState<PitchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<MelodyPoint[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  /** Token de generación: invalida start() en vuelo cuando stop() corre. */
  const genRef = useRef(0);
  /** Inicio del muestreo (para timestamps relativos de la ventana). */
  const startedAtRef = useRef(0);
  const windowRef = useRef<MelodyPoint[]>([]);

  const stop = useCallback(() => {
    // Invalidar cualquier start() pendiente: si está en el await de
    // getUserMedia, al volver verá el token cambiado y abortará.
    genRef.current += 1;
    runningRef.current = false;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      ctxRef.current?.close();
    } catch {
      /* noop */
    }
    ctxRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
    setPitch(null);
    setWindow([]);
    windowRef.current = [];
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const gen = genRef.current;
    try {
      const stream = await openMicrophoneStream();
      // stop() corrió mientras esperábamos el stream: abortar.
      if (gen !== genRef.current || runningRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const Ctx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        setError('Web Audio no disponible');
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const ctx = new Ctx();
      // El contexto puede arrancar 'suspended' hasta un gesto de usuario;
      // el click en el badge lo es, pero asegurar running evita analyser mudo.
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      if (gen !== genRef.current) {
        // stop() durante el resume: limpiar y abortar.
        await ctx.close().catch(() => {});
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      streamRef.current = stream;
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      runningRef.current = true;
      startedAtRef.current = performance.now();
      setActive(true);

      const sample = (): void => {
        if (!runningRef.current) return;
        const buf = bufRef.current;
        const an = analyserRef.current;
        if (buf && an) {
          an.getFloatTimeDomainData(buf);
          const result = detectPitch(buf, ctx.sampleRate);
          setPitch(result);

          // Mantener la ventana de pitch reciente para el comparador P2.
          const now = performance.now() - startedAtRef.current;
          windowRef.current.push({ timeMs: Math.round(now), freq: result?.freq ?? null });
          const cutoff = now - PITCH_WINDOW_MS;
          while (windowRef.current.length > 0 && windowRef.current[0].timeMs < cutoff) {
            windowRef.current.shift();
          }
          // Actualizar el estado a ~10 Hz (no en cada frame: evita re-render
          // continuo del badge; el comparador no necesita 60 fps).
          if (windowRef.current.length % 3 === 0) {
            setWindow([...windowRef.current]);
          }
        }
        rafRef.current = requestAnimationFrame(sample);
      };
      rafRef.current = requestAnimationFrame(sample);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Permiso de micrófono denegado — habilítalo para el widget.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No se encontró un micrófono disponible.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo abrir el micrófono.');
      }
      setActive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters de useState son estables
  }, []);

  // Cleanup al desmontar.
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      try {
        ctxRef.current?.close();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { active, pitch, error, window, start, stop };
}
