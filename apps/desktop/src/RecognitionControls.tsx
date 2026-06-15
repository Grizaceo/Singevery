import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSource } from './types';
import { CAPTURE_PAUSE_MS, CAPTURE_RECORD_MS, recordChunk, sleep } from './audio/capture';
import './RecognitionControls.css';

export function RecognitionControls() {
  const [activeSource, setActiveSource] = useState<AudioSource | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopListening = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveSource(null);
    setHint(null);
    setError(null);
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

      try {
        while (!controller.signal.aborted) {
          setHint(
            source === 'microphone'
              ? `Grabando micrófono (${CAPTURE_RECORD_MS / 1000}s)…`
              : `Grabando audio sistema (${CAPTURE_RECORD_MS / 1000}s)…`,
          );
          await window.api.setRecognitionPhase('LISTENING');

          const recordStartedAt = Date.now();
          const blob = await recordChunk(source, CAPTURE_RECORD_MS, controller.signal);
          if (blob.size === 0) {
            throw new Error('No se capturó audio — revisa permisos o volumen');
          }

          setHint('Identificando canción…');
          const buffer = await blob.arrayBuffer();
          const result = await window.api.identifyAudio(buffer, blob.type, recordStartedAt);

          if (!result.ok) {
            setError(result.error ?? 'Error al identificar');
            break;
          }

          if (result.matched) {
            setHint('Canción encontrada, cargando letra…');
          } else {
            setHint('Sin coincidencia, reintentando…');
          }

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
    };
  }, []);

  if (!window.api) {
    return null;
  }

  return (
    <div className="recognition-controls">
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
        title="Captura audio desde el micrófono"
      >
        Micrófono
      </button>
      {activeSource && (
        <button type="button" className="stop" onClick={() => void stopListening()}>
          Detener
        </button>
      )}
      {hint && !error && <span className="recognition-hint">{hint}</span>}
      {error && <span className="recognition-error">{error}</span>}
    </div>
  );
}
