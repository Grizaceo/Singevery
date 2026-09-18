import { describe, it, expect } from 'vitest';
import {
  HyprlandWindow,
  bindSignature,
  isHyprlandSession,
  luaString,
  monitorForRect,
  monitorWorkArea,
  overlayRuleLua,
  shellQuote,
  type HyprMonitor,
} from '../electron/services/linux/hyprland';
import { parseCliCommand } from '../electron/services/cliCommands';

const DP2: HyprMonitor = { id: 0, name: 'DP-2', x: 0, y: 0, width: 2560, height: 1440, scale: 1, reserved: [0, 0, 28, 0] };
const DP4: HyprMonitor = { id: 1, name: 'DP-4', x: 2560, y: 0, width: 1920, height: 1080, scale: 1, reserved: [0, 0, 28, 0] };

describe('hyprland: funciones puras', () => {
  it('solo se activa en Linux dentro de Hyprland y respeta el opt-out', () => {
    expect(isHyprlandSession({ HYPRLAND_INSTANCE_SIGNATURE: 'abc' }, 'linux')).toBe(true);
    expect(isHyprlandSession({ HYPRLAND_INSTANCE_SIGNATURE: 'abc', SINGEVERY_HYPRLAND: '0' }, 'linux')).toBe(false);
    expect(isHyprlandSession({}, 'linux')).toBe(false);
    expect(isHyprlandSession({ HYPRLAND_INSTANCE_SIGNATURE: 'abc' }, 'win32')).toBe(false);
  });

  it('luaString escapa con corchetes largos aunque el texto los contenga', () => {
    expect(luaString('address:0x1')).toBe('[[address:0x1]]');
    expect(luaString("a]]b")).toBe('[=[a]]b]=]');
    expect(luaString('a]]b]=]c')).toBe('[==[a]]b]=]c]==]');
  });

  it('shellQuote deja rutas simples y comilla lo demás', () => {
    expect(shellQuote('/opt/Singevery/singevery')).toBe('/opt/Singevery/singevery');
    expect(shellQuote('/home/u/Mis Apps/sing')).toBe("'/home/u/Mis Apps/sing'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it('área útil descuenta la barra reservada (formato [izq, arriba, der, abajo])', () => {
    expect(monitorWorkArea(DP4)).toEqual({ x: 2560, y: 0, width: 1892, height: 1080 });
  });

  it('área útil en coordenadas lógicas con escala y rotación', () => {
    const scaled: HyprMonitor = { ...DP2, scale: 2, reserved: [0, 30, 0, 0] };
    expect(monitorWorkArea(scaled)).toEqual({ x: 0, y: 30, width: 1280, height: 690 });
    const rotated: HyprMonitor = { ...DP4, transform: 1, reserved: [0, 0, 0, 0] };
    expect(monitorWorkArea(rotated)).toEqual({ x: 2560, y: 0, width: 1080, height: 1920 });
  });

  it('elige el monitor que contiene el centro del widget', () => {
    expect(monitorForRect([DP2, DP4], { x: 3000, y: 100, width: 760, height: 560 })?.name).toBe('DP-4');
    expect(monitorForRect([DP2, DP4], { x: 100, y: 100, width: 760, height: 560 })?.name).toBe('DP-2');
    // Fuera de todo monitor: el primero, nunca null con monitores presentes.
    expect(monitorForRect([DP2, DP4], { x: -5000, y: 0, width: 10, height: 10 })?.name).toBe('DP-2');
  });

  it('la regla del overlay ancla la clase exacta y pide flotante + fijada', () => {
    const lua = overlayRuleLua('singevery-overlay', 'singevery');
    expect(lua).toContain('class = [[^singevery$]]');
    expect(lua).toContain('float = true');
    expect(lua).toContain('pin = true');
  });

  it('bindSignature coincide con modmask:tecla de hyprctl binds', () => {
    expect(bindSignature('CTRL + ALT + S')).toBe('12:s');
    expect(bindSignature('SUPER + SHIFT + LEFT')).toBe('65:left');
  });
});

describe('HyprlandWindow', () => {
  function fakeHyprctl(overrides: { binds?: unknown[]; evalOut?: string } = {}) {
    const calls: string[][] = [];
    const clients = [
      { address: '0xother', pid: 1, at: [0, 0], size: [800, 600], monitor: 0, mapped: true },
      { address: '0xabc', pid: 4242, at: [1200, 700], size: [760, 560], monitor: 0, mapped: true },
    ];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === '-j' && args[1] === 'clients') return JSON.stringify(clients);
      if (args[0] === '-j' && args[1] === 'monitors') return JSON.stringify([DP2, DP4]);
      if (args[0] === '-j' && args[1] === 'binds') return JSON.stringify(overrides.binds ?? []);
      if (args[0] === 'eval') return overrides.evalOut ?? 'ok';
      return 'ok';
    };
    return { run, calls, clients };
  }

  it('init inyecta la regla; sin API Lua se desactiva', async () => {
    const ok = fakeHyprctl();
    expect(await new HyprlandWindow('singevery', 4242, ok.run).init(false)).toBe(true);
    expect(ok.calls[0][0]).toBe('eval');
    const legacy = fakeHyprctl({ evalOut: 'unknown request' });
    expect(await new HyprlandWindow('singevery', 4242, legacy.run).init(false)).toBe(false);
  });

  it('encuentra su ventana por pid y lee bounds reales', async () => {
    const { run } = fakeHyprctl();
    const w = new HyprlandWindow('singevery', 4242, run);
    expect(await w.getBounds()).toEqual({ x: 1200, y: 700, width: 760, height: 560 });
    expect(w.windowSelector()).toBe('[[address:0xabc]]');
  });

  it('mueve por dirección de ventana, nunca a la ventana enfocada', async () => {
    const { run, calls } = fakeHyprctl();
    const w = new HyprlandWindow('singevery', 4242, run);
    expect(await w.moveTo(300.4, 80)).toBe(true);
    const dispatches = calls.filter((c) => c[0] === 'dispatch').map((c) => c[1]);
    expect(dispatches).toEqual(['hl.dsp.window.move({ window = [[address:0xabc]], x = 300, y = 80 })']);
  });

  it('si el destino está en otro monitor, primero pasa la ventana a ese monitor', async () => {
    const { run, calls } = fakeHyprctl();
    const w = new HyprlandWindow('singevery', 4242, run);
    expect(await w.moveTo(2700, 80)).toBe(true);
    const dispatches = calls.filter((c) => c[0] === 'dispatch').map((c) => c[1]);
    expect(dispatches).toEqual([
      'hl.dsp.window.move({ window = [[address:0xabc]], monitor = [[DP-4]] })',
      'hl.dsp.window.move({ window = [[address:0xabc]], x = 2700, y = 80 })',
    ]);
  });

  it('placeAfterResize espera el tamaño nuevo antes de mover', async () => {
    const fake = fakeHyprctl();
    const w = new HyprlandWindow('singevery', 4242, fake.run);
    // Hyprland todavía muestra 760x560; aplica el resize "más tarde".
    setTimeout(() => {
      fake.clients[1].size = [156, 48];
    }, 50);
    expect(await w.placeAfterResize({ x: 1202, y: 10, width: 156, height: 48 })).toBe(true);
    const moves = fake.calls.filter((c) => c[0] === 'dispatch');
    expect(moves).toHaveLength(1);
    expect(moves[0][1]).toContain('x = 1202, y = 10');
  });

  it('no pisa atajos que el usuario ya tiene y no duplica los propios', async () => {
    const { run, calls } = fakeHyprctl({
      binds: [
        { modmask: 12, key: 'T', description: 'Mi atajo' },
        { modmask: 12, key: 'Left', description: 'Singevery: mover a la izquierda' },
      ],
    });
    const w = new HyprlandWindow('singevery', 4242, run);
    await w.registerBinds([
      { keys: 'CTRL + ALT + S', description: 'SING', dispatcher: 'hl.dsp.exec_cmd([[x]])' },
      { keys: 'CTRL + ALT + T', description: 'tangible', dispatcher: 'hl.dsp.exec_cmd([[y]])' },
      { keys: 'CTRL + ALT + LEFT', description: 'mover a la izquierda', dispatcher: 'z', repeating: true },
    ]);
    const evals = calls.filter((c) => c[0] === 'eval').map((c) => c[1]);
    expect(evals).toHaveLength(1);
    expect(evals[0]).toContain('hl.bind([[CTRL + ALT + S]]');
    expect(evals[0]).toContain('description = [[Singevery: SING]]');
  });

  it('dispose retira atajos y regla', async () => {
    const { run, calls } = fakeHyprctl();
    const w = new HyprlandWindow('singevery', 4242, run);
    await w.registerBinds([{ keys: 'CTRL + ALT + S', description: 'SING', dispatcher: 'x' }]);
    calls.length = 0;
    w.dispose();
    await new Promise((r) => setTimeout(r, 0));
    const evals = calls.map((c) => c[1]);
    expect(evals).toContain('hl.unbind([[CTRL + ALT + S]])');
    expect(evals.some((e) => e.includes('enabled = false'))).toBe(true);
  });
});

describe('HyprlandWindow: arrastre del handle', () => {
  function setup() {
    const clients = [{ address: '0xabc', pid: 4242, at: [1000, 500], size: [760, 560], monitor: 0, mapped: true }];
    const run = async (args: string[]): Promise<string> => {
      if (args[1] === 'clients') return JSON.stringify(clients);
      if (args[1] === 'monitors') return JSON.stringify([DP2, DP4]);
      return 'ok';
    };
    const cursor = { x: 1300, y: 510 };
    const socketCalls: string[] = [];
    const request = async (cmd: string): Promise<string> => {
      socketCalls.push(cmd);
      if (cmd === 'j/cursorpos') return JSON.stringify(cursor);
      return 'ok';
    };
    const w = new HyprlandWindow('singevery', 4242, run, 'singevery-overlay', request);
    return { w, cursor, socketCalls };
  }
  const moves = (calls: string[]) => calls.filter((c) => c.startsWith('dispatch'));
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('sigue al cursor desde la posición inicial de la ventana', async () => {
    const { w, cursor, socketCalls } = setup();
    expect(await w.beginDrag()).toBe(true);
    cursor.x += 50;
    cursor.y += 20;
    await wait(40);
    expect(await w.endDrag()).toBe(true);
    expect(moves(socketCalls).at(-1)).toBe(
      'dispatch hl.dsp.window.move({ window = [[address:0xabc]], x = 1050, y = 520 })',
    );
  });

  it('un clic sin movimiento no mueve la ventana (deja pasar el doble clic)', async () => {
    const { w, cursor, socketCalls } = setup();
    await w.beginDrag();
    cursor.x += 2; // por debajo del umbral
    await wait(30);
    expect(await w.endDrag()).toBe(false);
    expect(moves(socketCalls)).toEqual([]);
  });

  it('tras endDrag deja de seguir al cursor', async () => {
    const { w, cursor, socketCalls } = setup();
    await w.beginDrag();
    cursor.x += 40;
    await wait(30);
    await w.endDrag();
    const count = moves(socketCalls).length;
    cursor.x += 200;
    await wait(40);
    expect(moves(socketCalls).length).toBe(count);
  });
});

describe('HyprlandWindow: click-through (no_focus)', () => {
  function setup(delayMs = 0) {
    const clients = [{ address: '0xabc', pid: 4242, at: [0, 0], size: [760, 560], monitor: 0, mapped: true }];
    const run = async (): Promise<string> => JSON.stringify(clients);
    const sent: string[] = [];
    const request = async (cmd: string): Promise<string> => {
      await new Promise((r) => setTimeout(r, delayMs));
      sent.push(cmd);
      return 'ok';
    };
    return { w: new HyprlandWindow('singevery', 4242, run, 'singevery-overlay', request), sent };
  }

  it('alterna no_focus en la ventana propia y no repite el mismo valor', async () => {
    const { w, sent } = setup();
    await w.setPassthrough(true);
    await w.setPassthrough(true);
    await w.setPassthrough(false);
    expect(sent).toEqual([
      'dispatch hl.dsp.window.set_prop({ window = [[address:0xabc]], prop = "no_focus", value = "1" })',
      'dispatch hl.dsp.window.set_prop({ window = [[address:0xabc]], prop = "no_focus", value = "0" })',
    ]);
  });

  it('pedidos cruzados: gana el último (el sondeo no pisa una cancelación)', async () => {
    const { w, sent } = setup(15);
    await Promise.all([w.setPassthrough(true), w.setPassthrough(false)]);
    expect(sent.map((c) => /value = "(\d)"/.exec(c)?.[1])).toEqual(['1', '0']);
  });
});

describe('parseCliCommand', () => {
  it('reconoce los comandos de Singevery entre los flags de Chromium', () => {
    expect(parseCliCommand(['/usr/bin/singevery', '--allow-file-access', '--sing'], 40)).toEqual({ type: 'sing' });
    expect(parseCliCommand(['singevery', '--tangible'], 40)).toEqual({ type: 'tangible' });
    expect(parseCliCommand(['singevery', '--move=left'], 40)).toEqual({ type: 'move', dx: -40, dy: 0 });
    expect(parseCliCommand(['singevery', '--move=down'], 40)).toEqual({ type: 'move', dx: 0, dy: 40 });
  });

  it('sin comando (o dirección inválida) → null', () => {
    expect(parseCliCommand(['singevery'], 40)).toBeNull();
    expect(parseCliCommand(['singevery', '--move=diagonal'], 40)).toBeNull();
  });
});
