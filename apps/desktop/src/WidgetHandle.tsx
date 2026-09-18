import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  const handleElRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const isLinux = api?.platform === 'linux';
  // Linux + Hyprland: el main arrastra la ventana siguiendo al cursor, así el
  // handle conserva hover y doble clic como en Windows. Linux sin eso (otro
  // compositor Wayland): arrastre del compositor vía -webkit-app-region.
  const [managedDrag, setManagedDrag] = useState(false);
  useEffect(() => {
    if (!isLinux || !api?.getWindowCapabilities) return;
    let alive = true;
    void api.getWindowCapabilities().then((caps) => {
      if (alive) setManagedDrag(caps.ok && caps.managedDrag);
    });
    return () => {
      alive = false;
    };
  }, [api, isLinux]);
  const compositorDrag = isLinux && !managedDrag;

  const flush = useCallback(() => {
    frameRef.current = null;
    const next = pendingRef.current;
    if (next && api?.setPosition) {
      void api.setPosition(next.x, next.y);
    }
  }, [api]);

  const onPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLDivElement>) => {
      // Linux/Wayland sin arrastre gestionado: lo hace el compositor vía
      // -webkit-app-region (ver style); setPosition no tiene efecto.
      if (compositorDrag) return;
      if (isLinux && api?.beginWindowDrag && api.endWindowDrag) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        draggedRef.current = false;
        const endWindowDrag = api.endWindowDrag;
        // Cualquiera de estas señales termina el arrastre (una sola vez). La
        // de window cubre un pointerup que no llegue al handle si la captura
        // no se concedió; el main además corta si la ventana pierde el foco.
        const ends: Array<[EventTarget, string]> = [
          [target, 'pointerup'],
          [target, 'pointercancel'],
          [target, 'lostpointercapture'],
          [window, 'pointerup'],
        ];
        const onUp = (): void => {
          for (const [t, type] of ends) t.removeEventListener(type, onUp);
          void endWindowDrag().then((r) => {
            draggedRef.current = r.moved;
          });
        };
        for (const [t, type] of ends) t.addEventListener(type, onUp);
        void api.beginWindowDrag();
        return;
      }
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
    [api, flush, compositorDrag, isLinux],
  );

  const onDoubleClick = useCallback(() => {
    if (draggedRef.current) return;
    onToggleGhost();
  }, [onToggleGhost]);

  // Arrastre del compositor (Wayland sin Hyprland): el primer click ya inicia
  // el move interactivo y el doble click queda poco fiable. Toggle de modo
  // fantasma con un solo click.
  const onGhostClick = useCallback(() => {
    if (!compositorDrag) return;
    onToggleGhost();
  }, [compositorDrag, onToggleGhost]);

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
    // En Wayland el setPosition por IPC es ignorado por el compositor
    // (xdg-shell no permite auto-posicionamiento) y e.screenX no da deltas
    // fiables. En Hyprland el main arrastra por IPC (managedDrag); en otro
    // compositor la vía es -webkit-app-region: drag. Windows mantiene el loop
    // manual con setPosition.
    return {
      width,
      height,
      fontSize: `${0.85 * scale}rem`,
      borderRadius: Math.max(4, Math.round(6 * scale)),
      left: `clamp(${half}px, ${(positionX * 100).toFixed(1)}%, calc(100% - ${half}px))`,
      WebkitAppRegion: compositorDrag ? 'drag' : 'no-drag',
      // Variables consumidas por App.css (fondo con alpha vía color-mix).
      ['--handle-bg' as string]: color,
      ['--handle-fg' as string]: fg,
    } as CSSProperties;
  }, [compositorDrag, color, scale, positionX]);

  // Linux: el main necesita saber dónde está el asa para devolverle la
  // entrada al widget cuando el cursor pasa encima mientras es atravesable
  // (main.ts → setHyprlandClickThrough). `style` cubre escala y posición X.
  useEffect(() => {
    const el = handleElRef.current;
    if (!isLinux || !el || !api?.setHandleRect) return;
    const setHandleRect = api.setHandleRect;
    const report = (): void => {
      const r = el.getBoundingClientRect();
      void setHandleRect({ x: r.x, y: r.y, width: r.width, height: r.height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      void setHandleRect(null);
    };
  }, [api, isLinux, style]);

  return (
    <div
      ref={handleElRef}
      className={`widget-handle${ghost ? ' ghost' : ''}`}
      style={style}
      title={
        compositorDrag
          ? 'Arrastra para mover · click para modo transparente'
          : 'Arrastra para mover · doble click para modo transparente'
      }
      aria-label="Mover widget y mostrar controles"
      onPointerDown={onPointerDown}
      onClick={onGhostClick}
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
