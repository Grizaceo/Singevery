import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSource } from './types';
import {
  CAPTURE_PAUSE_MS,
  CAPTURE_RECORD_MS,
  CAPTURE_RESYNC_PAUSE_MS,
  recordChunk,
  sleep,
  SILENCE_PEAK,
  SystemAudioSession,
} from './audio/capture';
import { blobToWav16kMono } from './audio/wav';

/** Estado y acciones del motor de reconocimiento (capa de renderer).
 *  Un único hook viviendo en App; RecognitionControls lo consume por props. */
export interface RecognitionState {
  activeSource: AudioSource | null;
  hint: string | null;
  error: string | null;
  level: number;
  start: (source: AudioSource) => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * useRecognition — orquesta la captura + identificación continua por AudD.
 * Extraído de RecognitionControls para que la pill (y el atajo SING) puedan
 * arrancar el reconocimiento sin duplicar la lógica.
 */
export function useRecognition(): RecognitionState {
  const [activeSource, setActiveSource] = useState<AudioSource | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const systemSessionRef = useRef<SystemAudioSession | null>(null);

  const stop = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    systemSessionRef.current?.release();
    systemSessionRef.current = null;
    setActiveSource(null);
    setHint(null);
    setError(null);
    setLevel(0);
    await window.api?.stopRecognition();
  }, []);

  const start = useCallback(
    async (source: AudioSource) => {
      if (!window.api) {
        setError('API no disponible — usa npm run dev:electron');
        return;
      }

      await stop();

      const controller = new AbortController();
      abortRef.current = controller;
      setActiveSource(source);
      setError(null);
      setHint(
        source === 'microphone'
          ? 'Permite acceso al micrófono…'
          : 'Capturando audio del sistema…',
      );
      await window.api.setRecognitionPhase('LISTENING');

      if (source === 'system') {
        systemSessionRef.current = new SystemAudioSession();
      }

      try {
        // `tracking` = ya identificamos la canción y entramos en modo de
        // corrección continua: re-identificamos en silencio cada cierto tiempo
        // para reconciliar la deriva, sin tapar la letra con overlays.
        let tracking = false;

        while (!controller.signal.aborted) {
          if (!tracking) {
            setHint(
              source === 'microphone'
                ? `Grabando micrófono (${CAPTURE_RECORD_MS / 1000}s)…`
                : `Grabando audio sistema (${CAPTURE_RECORD_MS / 1000}s)…`,
            );
            await window.api.setRecognitionPhase('LISTENING');
          }

          const recordStartedAt = Date.now();
          // Nivel en vivo (~10 Hz mientras graba): alimenta la pausa del reloj
          // por silencio en el main y refresca el medidor de la UI.
          const onLevel = (lv: number): void => {
            setLevel(lv);
            void window.api?.reportLevel(lv);
          };
          const { blob, level } = await recordChunk(
            source,
            CAPTURE_RECORD_MS,
            controller.signal,
            systemSessionRef.current ?? undefined,
            onLevel,
          );
          setLevel(level);
          void window.api?.reportLevel(level);

          if (blob.size < 4096) {
            if (tracking) {
              // En seguimiento, un chunk vacío puntual no es fatal: reintentar.
              await sleep(CAPTURE_RESYNC_PAUSE_MS, controller.signal);
              continue;
            }
            throw new Error(
              source === 'microphone'
                ? 'No se capturó audio — revisa el permiso del micrófono.'
                : 'No se capturó audio del sistema — en Linux/WSL el loopback no está soportado (usa el micrófono o corre en Windows).',
            );
          }

          // Señal casi nula: no gastes una llamada a AudD; guía al usuario. Esto
          // distingue "sin señal/permiso" de "capturando pero en silencio".
          if (level < SILENCE_PEAK) {
            const msg =
              source === 'microphone'
                ? 'Sin señal del micrófono — sube el volumen, acércalo a los parlantes o reproduce música.'
                : 'Audio del sistema en silencio — sube el volumen o reproduce algo.';
            setHint(msg);
            await sleep(tracking ? CAPTURE_RESYNC_PAUSE_MS : CAPTURE_PAUSE_MS, controller.signal);
            continue;
          }

          const wavBlob = await blobToWav16kMono(blob);
          const buffer = await wavBlob.arrayBuffer();
          const mimeType = 'audio/wav';

          if (tracking) {
            // Corrección silenciosa de deriva. Errores se ignoran (la letra
            // sigue corriendo); un cambio de canción recarga la letra solo.
            const result = await window.api.correctAudio(buffer, mimeType, recordStartedAt);
            if (result.ok && result.matched && result.changed) {
              setHint('Nueva canción detectada…');
            } else {
              setHint('Sincronizado · corrigiendo en vivo…');
            }
            if (!controller.signal.aborted) {
              await sleep(CAPTURE_RESYNC_PAUSE_MS, controller.signal);
            }
            continue;
          }

          setHint('Identificando canción…');
          const result = await window.api.identifyAudio(buffer, mimeType, recordStartedAt);

          if (!result.ok) {
            const retryable =
              result.error?.includes('AudD #300') ||
              result.error?.includes('Shazam HTTP') ||
              result.error?.includes('no se reconoció');
            if (retryable) {
              setHint(
                level < SILENCE_PEAK * 4
                  ? 'No se reconoció — señal baja, sube el volumen o acércate. Reintentando…'
                  : 'No se reconoció la canción, reintentando…',
              );
              continue;
            }
            setError(result.error ?? 'Error al identificar');
            break;
          }

          if (result.matched) {
            // Match confirmado: el StateStore ancló la posición y carga la letra.
            // Pasamos a modo seguimiento para corregir la deriva continuamente.
            tracking = true;
            setHint('Sincronizado · corrigiendo en vivo…');
            if (!controller.signal.aborted) {
              await sleep(CAPTURE_RESYNC_PAUSE_MS, controller.signal);
            }
            continue;
          }

          setHint('Sin coincidencia, reintentando…');
          if (!controller.signal.aborted) {
            await sleep(CAPTURE_PAUSE_MS, controller.signal);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const message = err instanceof Error ? err.message : 'Error de captura';
        setError(message);
      } finally {
        systemSessionRef.current?.release();
        systemSessionRef.current = null;
        if (abortRef.current === controller) {
          abortRef.current = null;
          setActiveSource(null);
          setHint(null);
          await window.api?.stopRecognition();
        }
      }
    },
    [stop],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      systemSessionRef.current?.release();
    };
  }, []);

  return { activeSource, hint, error, level, start, stop };
}