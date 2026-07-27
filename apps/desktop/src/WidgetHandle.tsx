import { useCallback, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { DesktopApi } from './types';

interface WidgetHandleProps {
  api: DesktopApi | undefined;
  ghost: boolean;
  onToggleGhost: () => void;
  onReveal: () => void;
  onHoverChange: (hovering: boolean) => void;
  /** Personalización (Ajustes → Handle): color base, escala y posición X (0..1). */
  color?: string;
  scale?: number;
  positionX?: number;
}

const DRAG_THRESHOLD = 4;
/** Tamaño base del handle (escala 1). */
const BASE_WIDTH = 56;
const BASE_HEIGHT = 20;

/** Luminancia relativa: decide si el glifo va claro u oscuro sobre el color. */
function isColorDark(hex: string): boolean {
  const match = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return true;
  const n = parseInt(match[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}

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
  color = '#000000',
  scale = 1,
  positionX = 0.5,
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

  const style = useMemo<CSSProperties>(() => {
    const width = Math.round(BASE_WIDTH * scale);
    const height = Math.round(BASE_HEIGHT * scale);
    const half = Math.ceil(width / 2) + 6; // margen para no salirse de la ventana
    const fg = isColorDark(color) ? '#ffffff' : '#111114';
    return {
      width,
      height,
      fontSize: `${0.85 * scale}rem`,
      borderRadius: Math.max(4, Math.round(6 * scale)),
      left: `clamp(${half}px, ${(positionX * 100).toFixed(1)}%, calc(100% - ${half}px))`,
      // Variables consumidas por App.css (fondo con alpha vía color-mix).
      ['--handle-bg' as string]: color,
      ['--handle-fg' as string]: fg,
    };
  }, [color, scale, positionX]);

  return (
    <div
      className={`widget-handle${ghost ? ' ghost' : ''}`}
      style={style}
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
