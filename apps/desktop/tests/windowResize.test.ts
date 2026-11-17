import { describe, expect, it } from 'vitest';
import { resizeExpandedWindow, EXPANDED_MIN_HEIGHT, EXPANDED_MIN_WIDTH } from '../electron/services/windowLayout';

/**
 * Doble de una BrowserWindow NO redimensionable en Linux, con el
 * comportamiento real de Electron (verificado en Hyprland el 17-11):
 * setSize queda topado por el mínimo nativo y luego fija mínimo = máximo =
 * tamaño resultante.
 */
function nonResizableLinuxWindow(initial: [number, number]) {
  let size: [number, number] = [...initial];
  let minimum: [number, number] = [...initial];
  return {
    get size() {
      return size;
    },
    getMinimumSize: () => minimum,
    setMinimumSize: (w: number, h: number) => {
      minimum = [w, h];
    },
    setSize: (w: number, h: number) => {
      size = [Math.max(w, minimum[0]), Math.max(h, minimum[1])];
      minimum = [...size];
    },
  };
}

describe('resize expanded overlay', () => {
  it('el doble reproduce el bug: sin bajar el mínimo, setSize menor no achica', () => {
    const win = nonResizableLinuxWindow([760, 560]);
    win.setSize(1000, 800);
    win.setSize(600, 400);
    expect(win.size).toEqual([1000, 800]);
  });

  it('se puede volver a achicar después de agrandar', () => {
    const win = nonResizableLinuxWindow([760, 560]);
    resizeExpandedWindow(win, 1000, 800);
    expect(win.size).toEqual([1000, 800]);
    resizeExpandedWindow(win, 600, 400);
    expect(win.size).toEqual([600, 400]);
    resizeExpandedWindow(win, 900, 650);
    expect(win.size).toEqual([900, 650]);
  });

  it('respeta el mínimo de producto y rechaza valores no finitos', () => {
    const win = nonResizableLinuxWindow([760, 560]);
    resizeExpandedWindow(win, 0, 0);
    expect(win.size).toEqual([EXPANDED_MIN_WIDTH, EXPANDED_MIN_HEIGHT]);
    expect(resizeExpandedWindow(win, NaN, 200)).toBe(false);
    expect(resizeExpandedWindow(win, 400, Infinity)).toBe(false);
    expect(win.size).toEqual([EXPANDED_MIN_WIDTH, EXPANDED_MIN_HEIGHT]);
  });
});
