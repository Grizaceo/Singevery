import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSource } from './types';
import {
  type AudioInputDevice,
  CAPTURE_PAUSE_MS,
  CAPTURE_RECORD_MS,
  CAPTURE_RESYNC_PAUSE_MS,
  listAudioInputs,
  recordChunk,
  sleep,
  SILENCE_PEAK,
  SystemAudioSession,
} from './audio/capture';
import './RecognitionControls.css';

const FALLBACK_OPEN_KEY = 'espejo.fallbackOpen';

const MIC_DEVICE_KEY = 'espejo.micDeviceId';

/** Medidor de nivel: 5 bloques llenados según el pico medido (0..1). */
function LevelMeter({ level }: { level: number }) {
  const filled = Math.round(Math.min(1, level * 4) * 5);
  return (
    <span
      className={`level-meter${level < SILENCE_PEAK ? ' silent' : ''}`}
      title={`Nivel de entrada: ${Math.round(level * 100)}%`}
      aria-label="Nivel de audio de entrada"
    >
      {'▰'.repeat(filled)}
      {'▱'.repeat(5 - filled)}
    </span>
  );
}

export function RecognitionControls() {
  const [activeSource, setActiveSource] = useState<AudioSource | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [inputs, setInputs] = useState<AudioInputDevice[]>([]);
  // Panel colapsable: SMTC es la fuente primaria, así que los controles de
  // captura manual quedan como "modo fallback" plegados por defecto.
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FALLBACK_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [micDeviceId, setMicDeviceId] = useState<string>(() => {
    try {
      return localStorage.getItem(MIC_DEVICE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const abortRef = useRef<AbortController | null>(null);
  const systemSessionRef = useRef<SystemAudioSession | null>(null);
  // Ref espejo del dispositivo elegido para que el loop en curso lea el valor actual.
  const micDeviceIdRef = useRef(micDeviceId);

  const selectDevice = useCallback((id: string) => {
    setMicDeviceId(id);
    micDeviceIdRef.current = id;
    try {
      if (id) localStorage.setItem(MIC_DEVICE_KEY, id);
      else localStorage.removeItem(MIC_DEVICE_KEY);
    } catch {
      /* localStorage no disponible */
    }
  }, []);

  // Enumerar entradas de audio (mic, Stereo Mix, CABLE Output…) y refrescar
  // cuando cambian los dispositivos.
  useEffect(() => {
    if (!window.api || !navigator.mediaDevices) return;
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      const list = await listAudioInputs();
      if (!cancelled) setInputs(list);
    };
    void refresh();
    navigator.mediaDevices.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  const stopListening = useCallback(async () => {
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

  const startListening = useCallback(
    async (source: AudioSource) => {
      if (!window.api) {
        setError('API no disponible — usa npm run dev:electron');
        return;
      }

      await stopListening();

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
          const { blob, level } = await recordChunk(
            source,
            CAPTURE_RECORD_MS,
            controller.signal,
            systemSessionRef.current ?? undefined,
            micDeviceIdRef.current || undefined,
          );
          setLevel(level);

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

          const buffer = await blob.arrayBuffer();

          if (tracking) {
            // Corrección silenciosa de deriva. Errores se ignoran (la letra
            // sigue corriendo); un cambio de canción recarga la letra solo.
            const result = await window.api.correctAudio(buffer, blob.type, recordStartedAt);
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
          const result = await window.api.identifyAudio(buffer, blob.type, recordStartedAt);

          if (!result.ok) {
            const retryable = result.error?.includes('AudD #300');
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
    [stopListening],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      systemSessionRef.current?.release();
    };
  }, []);

  if (!window.api) {
    return null;
  }

  const toggleOpen = (): void => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(FALLBACK_OPEN_KEY, next ? '1' : '0');
      } catch {
        /* localStorage no disponible */
      }
      return next;
    });
  };

  return (
    <div className="recognition-controls">
      <button
        type="button"
        className="fallback-header"
        onClick={toggleOpen}
        title="La letra se sincroniza sola con tu reproductor (SMTC). Despliega esto solo para vinilo, micrófono en vivo o fuentes sin sesión de media."
      >
        <span className="fallback-caret">{open ? '▾' : '▸'}</span>
        <span>Modo manual (fallback)</span>
      </button>
      {open && (
        <>
          <p className="fallback-note">
            La letra se sincroniza sola con tu reproductor. Usa esto solo para
            vinilo / micrófono / en vivo.
          </p>
          <button
            type="button"
            className={activeSource === 'system' ? 'active' : ''}
        onClick={() => void startListening('system')}
        disabled={activeSource !== null}
        title="Captura el audio que suena en el sistema (altavoces)"
      >
        Audio sistema
      </button>
      <button
        type="button"
        className={activeSource === 'microphone' ? 'active' : ''}
        onClick={() => void startListening('microphone')}
        disabled={activeSource !== null}
        title="Captura audio desde la entrada seleccionada (mic / Stereo Mix / CABLE)"
      >
        Micrófono
      </button>
      <select
        className="mic-device-select"
        value={micDeviceId}
        onChange={(e) => selectDevice(e.target.value)}
        disabled={activeSource !== null}
        title="Entrada del micrófono. Para audio del sistema en WSL elige Stereo Mix o CABLE Output."
      >
        <option value="">Entrada predeterminada</option>
        {micDeviceId && !inputs.some((d) => d.deviceId === micDeviceId) && (
          <option value={micDeviceId}>Dispositivo guardado</option>
        )}
        {inputs.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
      {activeSource && (
        <button type="button" className="stop" onClick={() => void stopListening()}>
          Detener
        </button>
      )}
      {activeSource && <LevelMeter level={level} />}
      {hint && !error && <span className="recognition-hint">{hint}</span>}
      {error && <span className="recognition-error">{error}</span>}
        </>
      )}
    </div>
  );
}
