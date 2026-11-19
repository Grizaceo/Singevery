import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { DesktopApi } from './types';
import './ResizeGrip.css';
import { useT } from './i18n/useT';

interface Props {
  api: DesktopApi | undefined;
}

/**
 * Grip discreto en la esquina inferior derecha. Arrastrarlo redimensiona la
 * ventana del overlay vía IPC (api.setSize). Usa coordenadas de pantalla para
 * que el delta sea estable aunque la ventana se mueva, y rAF para no saturar
 * el canal IPC. El mínimo de tamaño lo aplica el proceso principal.
 */
export function ResizeGrip({ api }: Props) {
  const t = useT();
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ w: number; h: number } | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const next = pendingRef.current;
    if (next && api?.setSize) {
      void api.setSize(next.w, next.h);
    }
  }, [api]);

  const onPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !api?.getSize || !api?.setSize) return;
      e.preventDefault();
      e.stopPropagation();

      cleanupRef.current?.();
      const target = e.currentTarget;
      const pointerId = e.pointerId;
      const startX = e.screenX;
      const startY = e.screenY;
      let lastX = startX;
      let lastY = startY;
      let start: { width: number; height: number } | null = null;
      let ended = false;
      target.setPointerCapture(pointerId);

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        lastX = ev.screenX;
        lastY = ev.screenY;
        if (!start) return;
        pendingRef.current = {
          w: Math.round(start.width + (lastX - startX)),
          h: Math.round(start.height + (lastY - startY)),
        };
        if (frameRef.current == null) {
          frameRef.current = window.requestAnimationFrame(flush);
        }
      };

      const cleanup = () => {
        ended = true;
        cleanupRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('blur', onCancel);
        target.removeEventListener('lostpointercapture', onCancel);
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
        if (frameRef.current != null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        onMove(ev);
        cleanup();
        if (pendingRef.current && api.setSize) {
          void api.setSize(pendingRef.current.w, pendingRef.current.h);
          pendingRef.current = null;
        }
      };

      const onCancel = () => {
        cleanup();
        pendingRef.current = null;
      };
      cleanupRef.current = onCancel;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('blur', onCancel);
      target.addEventListener('lostpointercapture', onCancel);
      try {
        const result = await api.getSize();
        if (ended) return;
        if (!result.ok) { onCancel(); return; }
        start = result;
        if (lastX !== startX || lastY !== startY) {
          pendingRef.current = { w: result.width + lastX - startX, h: result.height + lastY - startY };
          frameRef.current = window.requestAnimationFrame(flush);
        }
      } catch {
        if (!ended) onCancel();
      }
    },
    [api, flush],
  );

  if (!api) return null;

  return (
    <div
      className="resize-grip"
      onPointerDown={onPointerDown}
      title={t('chrome.resizeGrip.title')}
      aria-label={t('chrome.resizeGrip.aria')}
      role="separator"
    >
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M11 4 L4 11 M11 8 L8 11" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
