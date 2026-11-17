import { describe, expect, it } from 'vitest';
import { resizeExpandedWindow } from '../electron/services/windowLayout';

describe('resize expanded overlay', () => {
  it('can shrink again after Electron promotes its native minimum while growing', () => {
    let size = [760, 560];
    let nativeMinimum = [...size];
    const win = {
      getMinimumSize: () => nativeMinimum,
      setSize: (w: number, h: number) => { size = [w, h]; nativeMinimum = [...size]; },
    };
    resizeExpandedWindow(win, 1000, 800);
    expect(win.getMinimumSize()).toEqual([1000, 800]);
    resizeExpandedWindow(win, 600, 400);
    expect(size).toEqual([600, 400]);
    resizeExpandedWindow(win, 0, 0);
    expect(size).toEqual([320, 200]);
    expect(resizeExpandedWindow(win, NaN, 200)).toBe(false);
    expect(resizeExpandedWindow(win, 400, Infinity)).toBe(false);
    expect(size).toEqual([320, 200]);
  });
});
