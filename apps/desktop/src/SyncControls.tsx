import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenderModel, Status } from './types';
import './SyncControls.css';

/** Estados donde tiene sentido mostrar los controles de sincronización. */
const SYNCABLE_STATUSES: Set<Status> = new Set([
  'DISPLAYING',
  'FETCHING_LYRICS',
  'NO_LYRICS',
]);

const NUDGE_WHEEL_MS = 1000; // ±1 s por notch de rueda

export function SyncControls() {
  const [hasLyrics, setHasLyrics] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  // Suscribirse propio al RenderModel para saber si hay letra cargada.
  useEffect(() => {
    if (!window.api) return;

    const unsubscribe = window.api.onRenderModel((model: RenderModel) => {
      setHasLyrics(SYNCABLE_STATUSES.has(model.status));
    });
    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
    };
  }, []);

  // Leer offset inicial.
  useEffect(() => {
    if (!window.api) return;
    window.api.getSyncOffset().then((r) => {
      if (r.ok) setOffsetMs(r.offsetMs);
    });
  }, []);

  const seekLine = useCallback(async (direction: -1 | 1) => {
    if (!window.api) return;
    await window.api.seekLine(direction);
  }, []);

  const nudgeSync = useCallback(async (deltaMs: number) => {
    if (!window.api) return;
    await window.api.nudgeSync(deltaMs);
  }, []);

  const adjustOffset = useCallback(async (deltaMs: number) => {
    if (!window.api) return;
    const result = await window.api.adjustSyncOffset(deltaMs);
    if (result.ok) setOffsetMs(result.offsetMs);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault?.();
      // deltaY < 0 (scroll up) = adelantar (+); deltaY > 0 (scroll down) = retroceder (−)
      const delta = e.deltaY < 0 ? NUDGE_WHEEL_MS : -NUDGE_WHEEL_MS;
      void nudgeSync(delta);
    },
    [nudgeSync],
  );

  if (!window.api) return null;

  return (
    <div className="sync-controls" onWheel={handleWheel}>
      <div className="sync-row">
        <button
          type="button"
          className="sync-btn seek"
          onClick={() => void seekLine(-1)}
          disabled={!hasLyrics}
          title="Retroceder una línea"
          aria-label="Retroceder una línea"
        >
          ◀
        </button>
        <button
          type="button"
          className="sync-btn seek"
          onClick={() => void seekLine(1)}
          disabled={!hasLyrics}
          title="Adelantar una línea"
          aria-label="Adelantar una línea"
        >
          ▶
        </button>
      </div>

      <div className="sync-row offset-row">
        <button
          type="button"
          className="sync-btn offset-adj"
          onClick={() => void adjustOffset(-100)}
          disabled={!hasLyrics}
          title="Atrasar letra 100ms"
          aria-label="Atrasar letra"
        >
          −
        </button>
        <span className="sync-offset-label" title="Offset de sincronización">
          {offsetMs === 0 ? '0' : `${offsetMs > 0 ? '+' : ''}${offsetMs}`}
        </span>
        <button
          type="button"
          className="sync-btn offset-adj"
          onClick={() => void adjustOffset(100)}
          disabled={!hasLyrics}
          title="Adelantar letra 100ms"
          aria-label="Adelantar letra"
        >
          +
        </button>
      </div>
    </div>
  );
}
