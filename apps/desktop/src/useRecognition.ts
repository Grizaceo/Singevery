import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSource } from './types';
import {
  type AudioCaptureSession,
  CAPTURE_FAST_PAUSE_MS,
  CAPTURE_PAUSE_MS,
  CAPTURE_RECORD_MS,
  CAPTURE_RESYNC_PAUSE_MS,
  createCaptureSession,
  recordChunk,
  sleep,
  SILENCE_PEAK,
} from './audio/capture';
import { AudioMonitor } from './audio/monitor';
import type { BoundaryKind } from './audio/trackChange';
import { blobToWav16kMono } from './audio/wav';

/**
 * Tope de ciclos rápidos seguidos. Cinco cubren la histéresis más exigente
 * (2 confirmaciones normalmente, 5 cuando el reproductor del SO contradice al
 * audio). Pasado ese punto, las señales sencillamente no se ponen de acuerdo:
 * insistir cada ~7s contra la red no lo va a resolver, así que se vuelve a la
 * cadencia normal hasta que la sospecha se despeje.
 */
const MAX_FAST_CYCLES = 5;

/** Estado y acciones del motor de reconocimiento (capa de renderer).
 *  Un único hook viviendo en App; RecognitionControls lo consume por props. */
export interface RecognitionState {
  activeSource: AudioSource | null;
  hint: string | null;
  error: string | null;
  level: number;
  start: (source: AudioSource) => Promise<void>;
  stop: () => Promise<void>;
  /**
   * Corta la espera entre ciclos y vuelve a identificar YA. Lo disparan el main
   * (el reproductor del SO avisó de un cambio que el arbitraje no pudo
   * confirmar por metadata, o la correlación de energía no cuadra) y el monitor
   * local de audio al ver un corte de pista. Sin esto había que esperar el
   * ciclo completo (~18s) para que la letra nueva apareciera.
   */
  requestResync: () => void;
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
  const sessionRef = useRef<AudioCaptureSession | null>(null);
  const monitorRef = useRef<AudioMonitor | null>(null);
  /** Track al que está enganchado el monitor: si cambia, hay que re-montarlo. */
  const monitorTrackRef = useRef<string | null>(null);
  /** Resolver de la espera en curso: llamarlo la termina antes de tiempo. */
  const wakeRef = useRef<(() => void) | null>(null);
  /**
   * Petición de resync pendiente de consumir.
   *
   * Sin esta bandera, una petición que llegaba mientras el ciclo GRABABA o
   * esperaba a la red se perdía entera (no había ninguna espera que cortar) —
   * y ese es justo el momento en que las emite el detector de energía del main,
   * que corre dentro del propio IPC de corrección. La bandera hace que la
   * próxima espera se salte, venga cuando venga la petición.
   */
  const pendingResyncRef = useRef(false);

  /** Espera `ms` pero se corta si hay (o llega) una petición de resync. */
  const sleepOrWake = useCallback(async (ms: number, signal: AbortSignal) => {
    if (pendingResyncRef.current) {
      pendingResyncRef.current = false;
      return;
    }
    let wake: (() => void) | null = null;
    const woken = new Promise<void>((resolve) => {
      wake = resolve;
      wakeRef.current = resolve;
    });
    try {
      await Promise.race([sleep(ms, signal), woken]);
    } finally {
      if (wakeRef.current === wake) wakeRef.current = null;
      // Consumida: o dormimos completo (no había nada) o nos despertó.
      pendingResyncRef.current = false;
    }
  }, []);

  const requestResync = useCallback(() => {
    pendingResyncRef.current = true;
    wakeRef.current?.();
    wakeRef.current = null;
  }, []);

  /** Desmonta el monitor continuo y la sesión de captura. */
  const releaseCapture = useCallback(() => {
    monitorRef.current?.close();
    monitorRef.current = null;
    monitorTrackRef.current = null;
    sessionRef.current?.release();
    sessionRef.current = null;
  }, []);

  const stop = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    releaseCapture();
    setActiveSource(null);
    setHint(null);
    setError(null);
    setLevel(0);
    // Al parar, rehabilita la fuente externa (SMTC) por si el PC reproduce.
    await window.api?.setRecognitionSource(null);
    await window.api?.stopRecognition();
  }, [releaseCapture]);

  /**
   * Engancha el monitor continuo al stream ya abierto. Se llama DESPUÉS de la
   * primera grabación: para entonces la sesión ya tiene stream (en modo sistema
   * eso significa que el permiso de captura ya se concedió), así que montar el
   * tap no dispara ningún diálogo extra.
   */
  const attachMonitor = useCallback(() => {
    const stream = sessionRef.current?.current();
    const trackId = stream?.getAudioTracks()[0]?.id ?? null;
    // El stream murió (el usuario cortó la captura, se desenchufó el micro): el
    // monitor colgado de él reportaría silencio para siempre y eso CONGELA la
    // letra (la pausa por silencio del reloj es real). Se desmonta y se vuelve a
    // montar cuando la sesión re-adquiera.
    if (!stream || !trackId) {
      monitorRef.current?.close();
      monitorRef.current = null;
      monitorTrackRef.current = null;
      return;
    }
    if (monitorRef.current && monitorTrackRef.current === trackId) return;
    monitorRef.current?.close();
    monitorRef.current = null;
    const monitor = new AudioMonitor(stream, {
      onLevel: (lv) => {
        setLevel(lv);
        void window.api?.reportLevel(lv);
      },
      onBoundary: (kind: BoundaryKind) => {
        // El audio se cortó: avisar al main (le sirve como segunda señal para
        // confirmar el cambio sin esperar otra vuelta de histéresis) y
        // re-identificar sin agotar la pausa.
        void window.api?.reportTrackBoundary(kind);
        requestResync();
      },
    });
    if (!monitor.active) {
      monitor.close();
      return;
    }
    monitorRef.current = monitor;
    monitorTrackRef.current = trackId;
  }, [requestResync]);

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
      // Modo micrófono = audio externo al PC: suprime SMTC para que el
      // reproductor del PC no pise la letra que identifica el micrófono.
      await window.api.setRecognitionSource(source);

      // Sesión persistente para las dos fuentes: el stream sigue vivo entre
      // ciclos y sobre él escucha el monitor continuo durante las pausas.
      const session = createCaptureSession(source);
      sessionRef.current = session;

      try {
        // `tracking` = ya identificamos la canción y entramos en modo de
        // corrección continua: re-identificamos en silencio cada cierto tiempo
        // para reconciliar la deriva, sin tapar la letra con overlays.
        let tracking = false;
        // Ciclos rápidos encadenados para cerrar un cambio a medio confirmar.
        // Con tope: si el reconocedor oscila entre dos canciones la racha nunca
        // llega a las confirmaciones que pide la histéresis, y sin este freno
        // el lazo rápido se quedaría girando (y gastando llamadas) para siempre.
        let fastCycles = 0;

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
          // Nivel en vivo mientras graba. Se mantiene aunque el monitor continuo
          // ya esté montado: reportar el mismo valor dos veces es inocuo (el
          // detector de silencio es idempotente) y cubre el caso en que el
          // AudioContext del monitor no arranque — ahí quedarse sin nivel
          // congelaría la letra.
          const onLevel = (lv: number): void => {
            setLevel(lv);
            void window.api?.reportLevel(lv);
          };
          const { blob, level } = await recordChunk(
            source,
            CAPTURE_RECORD_MS,
            controller.signal,
            session,
            onLevel,
          );
          attachMonitor();
          setLevel(level);
          void window.api?.reportLevel(level);

          if (blob.size < 4096) {
            if (tracking) {
              // En seguimiento, un chunk vacío puntual no es fatal: reintentar.
              await sleepOrWake(CAPTURE_RESYNC_PAUSE_MS, controller.signal);
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
            await sleepOrWake(tracking ? CAPTURE_RESYNC_PAUSE_MS : CAPTURE_PAUSE_MS, controller.signal);
            continue;
          }

          const wavBlob = await blobToWav16kMono(blob);
          const buffer = await wavBlob.arrayBuffer();
          const mimeType = 'audio/wav';

          if (tracking) {
            // Corrección silenciosa de deriva. Errores se ignoran (la letra
            // sigue corriendo); un cambio de canción recarga la letra solo.
            const result = await window.api.correctAudio(buffer, mimeType, recordStartedAt);
            if (controller.signal.aborted) break; // F2: se detuvo mientras corregía.
            if (result.ok && result.matched && result.changed) {
              setHint('Nueva canción detectada…');
              fastCycles = 0;
            } else if (result.ok && result.suspected) {
              // El fingerprint ya vio OTRA canción pero la histéresis todavía
              // no la da por buena. Esa confirmación tenía que llegar en el
              // ciclo siguiente (~20s después): encadenarla de inmediato la
              // baja a los ~7s que cuesta grabar e identificar.
              setHint('Comprobando cambio de canción…');
              fastCycles += 1;
            } else {
              setHint('Sincronizado · corrigiendo en vivo…');
              fastCycles = 0;
            }
            if (!controller.signal.aborted) {
              // El contador sigue subiendo por encima del tope: así, mientras
              // la sospecha no se despeje, la cadencia vuelve a la normal en
              // vez de alternar entre rápida y lenta.
              const fast = fastCycles > 0 && fastCycles <= MAX_FAST_CYCLES;
              await sleepOrWake(
                fast ? CAPTURE_FAST_PAUSE_MS : CAPTURE_RESYNC_PAUSE_MS,
                controller.signal,
              );
            }
            continue;
          }

          setHint('Identificando canción…');
          const result = await window.api.identifyAudio(buffer, mimeType, recordStartedAt);
          if (controller.signal.aborted) break; // F2: se detuvo mientras identificaba.

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
              await sleepOrWake(CAPTURE_RESYNC_PAUSE_MS, controller.signal);
            }
            continue;
          }

          setHint('Sin coincidencia, reintentando…');
          if (!controller.signal.aborted) {
            await sleepOrWake(CAPTURE_PAUSE_MS, controller.signal);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const message = err instanceof Error ? err.message : 'Error de captura';
        setError(message);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          releaseCapture();
          setActiveSource(null);
          setHint(null);
          await window.api?.stopRecognition();
        }
      }
    },
    [stop, sleepOrWake, attachMonitor, releaseCapture],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      monitorRef.current?.close();
      sessionRef.current?.release();
    };
  }, []);

  return { activeSource, hint, error, level, start, stop, requestResync };
}
