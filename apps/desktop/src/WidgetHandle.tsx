import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { DesktopApi } from './types';

interface WidgetHandleProps {
  api: DesktopApi | undefined;
  ghost: boolean;
  onToggleGhost: () => void;
  onReveal: () => void;
  onHoverChange: (hovering: boolean) => void;
}

const DRAG_THRESHOLD = 4;

/**
 * Handle central único del overlay: arrastra la ventana por IPC, revela la
 * chrome al hover (fuera de modo fantasma) y alterna modo fantasma con
 * doble click (ignorado si hubo arrastre entre clicks).
 */
export function WidgetHandle({
  api,
  ghost,
  onToggleGhost,
  onReveal,
  onHoverChange,
}: WidgetHandleProps) {
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const flush = useCallback(() => {
    frameRef.current = null;
    const next = pendingRef.current;
    if (next && api?.setPosition) {
      void api.setPosition(next.x, next.y);
    }
  }, [api]);

  const onPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!api?.getPosition || !api?.setPosition) return;
      e.preventDefault();
      e.stopPropagation();

      const start = await api.getPosition();
      if (!start.ok) return;

      draggedRef.current = false;

      const startX = e.screenX;
      const startY = e.screenY;
      const startPosX = start.x;
      const startPosY = start.y;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.screenX - startX;
        const dy = ev.screenY - startY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          draggedRef.current = true;
        }
        pendingRef.current = {
          x: Math.round(startPosX + dx),
          y: Math.round(startPosY + dy),
        };
        if (frameRef.current == null) {
          frameRef.current = window.requestAnimationFrame(flush);
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (frameRef.current != null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        if (pendingRef.current && api.setPosition) {
          void api.setPosition(pendingRef.current.x, pendingRef.current.y);
          pendingRef.current = null;
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [api, flush],
  );

  const onDoubleClick = useCallback(() => {
    if (draggedRef.current) return;
    onToggleGhost();
  }, [onToggleGhost]);

  const onMouseEnter = useCallback(() => {
    onHoverChange(true);
    if (!ghost) onReveal();
  }, [ghost, onHoverChange, onReveal]);

  const onMouseMove = useCallback(() => {
    if (!ghost) onReveal();
  }, [ghost, onReveal]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!ghost) onReveal();
    },
    [ghost, onReveal],
  );

  const onMouseLeave = useCallback(() => {
    onHoverChange(false);
  }, [onHoverChange]);

  return (
    <div
      className={`widget-handle${ghost ? ' ghost' : ''}`}
      title="Arrastra para mover · doble click para modo transparente"
      aria-label="Mover widget y mostrar controles"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
    >
      ⋮⋮
    </div>
  );
}
