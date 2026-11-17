import { describe, expect, it } from 'vitest';
import { defaultHandleRect, handleVisibilityOffset } from '../electron/services/windowLayout';

// Monitores del equipo del usuario (17-11): DP-1 2560×1440 en 0,0 y DP-2
// 1920×1080 en 2560,0, ambos con 26 px reservados abajo para la barra.
const WORK_AREAS = [
  { x: 0, y: 0, width: 2560, height: 1414 },
  { x: 2560, y: 0, width: 1920, height: 1054 },
];

describe('handleVisibilityOffset', () => {
  it('no mueve si la pestañita ya se ve', () => {
    const win = { x: 1517, y: 80, width: 777, height: 833 };
    expect(handleVisibilityOffset(win, defaultHandleRect(win.width), WORK_AREAS)).toEqual({ dx: 0, dy: 0 });
  });

  it('caso real: ventana en y = −100 → baja lo justo para mostrar la pestañita', () => {
    const win = { x: 1517, y: -100, width: 777, height: 833 };
    const handle = defaultHandleRect(win.width);
    const { dx, dy } = handleVisibilityOffset(win, handle, WORK_AREAS);
    expect(dx).toBe(0);
    expect(win.y + dy + handle.y).toBe(8); // margen superior
  });

  it('ventana corrida a la izquierda fuera de pantalla → vuelve a entrar', () => {
    const win = { x: -700, y: 200, width: 760, height: 560 };
    const handle = defaultHandleRect(win.width);
    const { dx, dy } = handleVisibilityOffset(win, handle, WORK_AREAS);
    expect(dy).toBe(0);
    expect(win.x + dx + handle.x).toBe(8);
  });

  it('pestañita a caballo entre monitores de distinta altura → la lleva al más cercano', () => {
    // Bajo el monitor derecho (que mide 1080) pero dentro del alto del izquierdo.
    const win = { x: 3000, y: 1200, width: 600, height: 400 };
    const handle = defaultHandleRect(win.width);
    const { dy } = handleVisibilityOffset(win, handle, WORK_AREAS);
    expect(win.y + dy + handle.y + handle.height).toBeLessThanOrEqual(1054 - 8);
  });

  it('usa el rect real que informa el renderer (pestañita desplazada a la derecha)', () => {
    const win = { x: 2000, y: 100, width: 760, height: 560 };
    const handle = { x: 690, y: 6, width: 56, height: 20 };
    // La pestañita cae en 2690–2746, dentro de DP-2: no se mueve.
    expect(handleVisibilityOffset(win, handle, WORK_AREAS)).toEqual({ dx: 0, dy: 0 });
  });

  it('sin áreas útiles no hace nada', () => {
    expect(handleVisibilityOffset({ x: -5000, y: -5000, width: 100, height: 100 }, defaultHandleRect(100), [])).toEqual({ dx: 0, dy: 0 });
  });
});
