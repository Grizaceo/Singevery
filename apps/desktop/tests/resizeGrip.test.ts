import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, PointerEvent as ReactPointerEvent } from 'react';
import type { DesktopApi } from '../src/types';

const lifecycle = vi.hoisted(() => ({ cleanup: [] as Array<() => void> }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: <T>(value: T) => ({ current: value }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void)) => { lifecycle.cleanup.push(effect()); },
  useContext: () => null,
}));
import { ResizeGrip } from '../src/ResizeGrip';

class GripTarget extends EventTarget {
  captured = false;
  setPointerCapture() { this.captured = true; }
  hasPointerCapture() { return this.captured; }
  releasePointerCapture() { this.captured = false; }
}
function pointer(type: string, x: number, y: number, id = 1) {
  return Object.assign(new Event(type), { pointerId: id, screenX: x, screenY: y });
}
function setup() {
  const target = new GripTarget();
  const surface = Object.assign(new EventTarget(), {
    requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn(),
  });
  vi.stubGlobal('window', surface);
  let resolveSize!: (value: { ok: boolean; width: number; height: number }) => void;
  const api = {
    getSize: vi.fn(() => new Promise(resolve => { resolveSize = resolve; })),
    setSize: vi.fn(async () => ({ ok: true })),
  };
  const element = ResizeGrip({ api: api as unknown as DesktopApi }) as ReactElement<{
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => Promise<void>;
  }>;
  const event = {
    button: 0, pointerId: 1, screenX: 800, screenY: 600, currentTarget: target,
    preventDefault() {}, stopPropagation() {},
  } as unknown as ReactPointerEvent<HTMLDivElement>;
  return { target, surface, api, down: () => element.props.onPointerDown(event), resolve: () => resolveSize({ ok: true, width: 800, height: 600 }) };
}
afterEach(() => { lifecycle.cleanup.splice(0).forEach(cleanup => cleanup()); vi.unstubAllGlobals(); });
describe('resize pointer lifetime', () => {
  it('handles pointerup before getSize resolves without leaving an active drag', async () => {
    const { down, target, surface, api, resolve } = setup();
    const pending = down();
    expect(target.captured).toBe(true);
    surface.dispatchEvent(pointer('pointerup', 780, 580));
    resolve(); await pending;
    expect(target.captured).toBe(false);
    surface.dispatchEvent(pointer('pointermove', 100, 100));
    expect(api.setSize).not.toHaveBeenCalled();
  });
  it('uses the final pointer position when shrinking and releases capture', async () => {
    const { down, target, surface, api, resolve } = setup();
    const pending = down(); resolve(); await pending;
    surface.dispatchEvent(pointer('pointermove', 700, 500));
    surface.dispatchEvent(pointer('pointerup', 600, 400));
    expect(api.setSize).toHaveBeenLastCalledWith(600, 400);
    expect(target.captured).toBe(false);
    surface.dispatchEvent(pointer('pointermove', 100, 100));
    expect(api.setSize).toHaveBeenCalledTimes(1);
  });
  it.each(['pointercancel', 'blur', 'unmount'])('cancels pending frames on %s', async type => {
    const { down, target, surface, api, resolve } = setup();
    const pending = down(); resolve(); await pending;
    surface.dispatchEvent(pointer('pointermove', 700, 500));
    if (type === 'unmount') lifecycle.cleanup.splice(0).forEach(cleanup => cleanup());
    else surface.dispatchEvent(pointer(type, 700, 500));
    expect(surface.cancelAnimationFrame).toHaveBeenCalled();
    expect(target.captured).toBe(false);
    surface.dispatchEvent(pointer('pointerup', 600, 400));
    expect(api.setSize).not.toHaveBeenCalled();
  });
});
