import { useEffect, useRef, useState } from 'react';
import type { RenderModel } from '../types';
import { INITIAL_RENDER_MODEL } from '../initialModel';

const RECONNECT_MS = 2000;

export function useRemoteModel(): { model: RenderModel; connected: boolean; error: string | null } {
  const [model, setModel] = useState<RenderModel>(INITIAL_RENDER_MODEL);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const connect = (): void => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const next = JSON.parse(String(event.data)) as RenderModel;
          setModel(next);
        } catch {
          /* ignore malformed payloads */
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        wsRef.current = null;
        timerRef.current = window.setTimeout(connect, RECONNECT_MS);
      };

      ws.onerror = () => {
        if (cancelled) return;
        setError('No se pudo conectar al PC');
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { model, connected, error };
}
