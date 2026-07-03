import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAPTURE_PAUSE_MS,
  CAPTURE_RECORD_MS,
  CAPTURE_RESYNC_PAUSE_MS,
  recordChunk,
  sleep,
  SILENCE_PEAK,
} from '../audio/capture';
import { blobToWav16kMono } from '../audio/wav';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export interface RemoteMicState {
  active: boolean;
  connected: boolean;
  hint: string | null;
  error: string | null;
  level: number;
  start: () => Promise<void>;
  stop: () => void;
}

export function useRemoteMic(): RemoteMicState {
  const [active, setActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendJson = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const ensureSocket = useCallback((): Promise<WebSocket> => {
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/mic`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        resolve(ws);
      };

      ws.onerror = () => {
        setConnected(false);
        reject(new Error('No se pudo conectar al PC'));
      };

      ws.onclose = () => {
        setConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
      };
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setActive(false);
    setHint(null);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    setHint('Conectando al PC…');

    try {
      await ensureSocket();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de conexión';
      setError(message);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setActive(true);
    sendJson({ type: 'phase', phase: 'LISTENING' });

    try {
      let tracking = false;

      while (!controller.signal.aborted) {
        if (!tracking) {
          setHint(`Escuchando (${CAPTURE_RECORD_MS / 1000}s)…`);
          sendJson({ type: 'phase', phase: 'LISTENING' });
        }

        const recordStartedAt = Date.now();
        const onLevel = (lv: number): void => {
          setLevel(lv);
          sendJson({ type: 'level', level: lv });
        };

        const { blob, level: peak } = await recordChunk(
          'microphone',
          CAPTURE_RECORD_MS,
          controller.signal,
          undefined,
          onLevel,
        );
        setLevel(peak);
        sendJson({ type: 'level', level: peak });

        if (blob.size < 4096) {
          if (tracking) {
            await sleep(CAPTURE_RESYNC_PAUSE_MS, controller.signal);
            continue;
          }
          throw new Error('No se capturó audio — revisa el permiso del micrófono.');
        }

        if (peak < SILENCE_PEAK) {
          setHint('Sin señal — acerca el teléfono a los parlantes.');
          await sleep(tracking ? CAPTURE_RESYNC_PAUSE_MS : CAPTURE_PAUSE_MS, controller.signal);
          continue;
        }

        const wavBlob = await blobToWav16kMono(blob);
        const buffer = await wavBlob.arrayBuffer();

        if (tracking) {
          sendJson({
            type: 'audio',
            mode: 'correct',
            mimeType: 'audio/wav',
            recordStartedAt,
            data: arrayBufferToBase64(buffer),
          });
          setHint('Sincronizado · escuchando…');
          await sleep(CAPTURE_RESYNC_PAUSE_MS, controller.signal);
          continue;
        }

        setHint('Identificando canción…');
        sendJson({ type: 'phase', phase: 'IDENTIFYING' });
        sendJson({
          type: 'audio',
          mode: 'identify',
          mimeType: 'audio/wav',
          recordStartedAt,
          data: arrayBufferToBase64(buffer),
        });

        tracking = true;
        setHint('Sincronizado · escuchando…');
        await sleep(CAPTURE_RESYNC_PAUSE_MS, controller.signal);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Error de captura';
      setError(message);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setActive(false);
        setHint(null);
        sendJson({ type: 'phase', phase: null });
      }
    }
  }, [ensureSocket, sendJson, stop]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      wsRef.current?.close();
    };
  }, []);

  return { active, connected, hint, error, level, start, stop };
}
